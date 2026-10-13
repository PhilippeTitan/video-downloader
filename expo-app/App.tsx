import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Easing, Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { WEB_HTML } from './webBundle';

/**
 * Expo Go shell: the same inlined Vite build the iOS shell ships, rendered
 * in a full-screen WebView, layered OVER a browsing WebView (chrome-over-
 * content). UI -> shell messages arrive as JSON ({ source: 'vd-ui', type,
 * payload }); detections + navigation state go back into the UI via
 * webRef.injectJavaScript(window.postMessage(...)).
 *
 * Tab model: the web UI is the source of truth for ordering; it pushes the
 * full list via `syncTabs`. The shell mirrors it here and keeps a per-tab
 * URL history stack for back/forward. Tabs with a URL keep their browsing
 * WebView ALIVE across switches (up to MAX_ALIVE_TABS most-recent; older
 * ones are evicted and resume at their last page on next activation), so
 * switching tabs is instant — no reload.
 */

const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.7 Safari/605.1.15';

/** Mobile subdomains pin their mobile site regardless of UA (e.g.
 *  m.youtube.com serves the sticky mini-player layout even to desktop
 *  browsers). Top-level requests to these hosts are rewritten to the
 *  desktop counterpart so pages match real iPad Safari behavior. */
const MOBILE_HOST_REWRITES: Record<string, string> = {
  'm.youtube.com': 'www.youtube.com',
};

function rewriteMobileUrl(url: string): string | null {
  const m = /^(https?:\/\/)([^/?#]+)([/?#].*)?$/i.exec(url);
  if (!m) return null;
  const target = MOBILE_HOST_REWRITES[m[2].toLowerCase()];
  if (!target) return null;
  return m[1] + target + (m[3] || '');
}

/** How many browsing WebViews stay mounted (active + most recently seen).
 *  iPad 6th gen (2GB RAM): beyond this the LRU tab is evicted; it reloads
 *  at its last known page when re-activated. */
const MAX_ALIVE_TABS = 4;

interface ShellTab {
  id: string;
  /** Source-driver URL: changes only on explicit loads (search, address bar,
   *  history-jump fallback) — in-page navigations never touch it, so the
   *  WebView is never re-driven by a render. */
  url: string;
  title?: string;
  /** Live page URL as reported by onNavigationStateChange (display + evict-resume). */
  currentUrl?: string;
}

interface TabHistory {
  stack: string[];
  index: number;
}

interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** false = placed but invisible (page loads hidden); true = revealed. */
  visible?: boolean;
  /** Full slot rect while x/y/w/h are clipped to the wipe region: the
   *  WebView's native frame stays STATIC here and the wrapper clips it, so
   *  the page never resizes (no viewport relayout / mid-wipe reloads). */
  frame?: { x: number; y: number; w: number; h: number };
}

/** Injected into every browsing page: sniff <video> srcs and .m3u8 traffic. */
const SNIFFER_JS = `
(function () {
  if (window.__vdSniff) return;
  window.__vdSniff = true;
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      source: 'vd-browser', type: 'ua',
      payload: { ua: navigator.userAgent },
    }));
  } catch (e) {}
  function post(url, kind) {
    if (!url || url.indexOf('blob:') === 0) return;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        source: 'vd-browser', type: 'detect',
        payload: { url: url, kind: kind, title: document.title },
      }));
    } catch (e) {}
  }
  function scanVideos() {
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i];
      var s = v.currentSrc || v.src || '';
      if (s) post(s, 'video');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanVideos);
  } else {
    scanVideos();
  }
  try {
    new MutationObserver(scanVideos).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['src'],
    });
  } catch (e) {}
  setInterval(function () {
    try {
      var entries = performance.getEntriesByType('resource');
      for (var i = 0; i < entries.length; i++) {
        var n = entries[i].name || '';
        if (/\\.m3u8(\\?|$)/.test(n)) post(n, 'hls');
        else if (/\\.(mp4|mov|m4v|webm)(\\?|$)/.test(n)) post(n, 'video');
      }
    } catch (e) {}
  }, 2500);
  var of = window.fetch;
  if (of) {
    window.fetch = function () {
      try {
        var u = arguments[0];
        var s = typeof u === 'string' ? u : (u && u.url) || '';
        if (/\\.m3u8(\\?|$)/.test(s)) post(s, 'hls');
      } catch (e) {}
      return of.apply(this, arguments);
    };
  }
  var oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    try {
      if (typeof u === 'string' && /\\.m3u8(\\?|$)/.test(u)) post(u, 'hls');
    } catch (e) {}
    return oo.apply(this, arguments);
  };
  var lastI = 0;
  function ping() {
    var now = Date.now();
    if (now - lastI < 400) return;
    lastI = now;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        source: 'vd-browser', type: 'interact',
      }));
    } catch (e) {}
  }
  ['touchstart', 'mousedown', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, ping, { passive: true, capture: true });
  });
})();
true;
`;

/** Pull-to-refresh inside the browsing page: the UI's own pull handlers live
 *  under the native pane and never see these touches, so the page itself
 *  detects an overscroll at the top and reports it. The UI then runs its
 *  normal refresh flow (spinner + `reload` action).
 *  Injected BEFORE content loads: with the regular injection there's a dead
 *  window after every reload (page loads slowly, listeners not attached yet,
 *  pulls silently do nothing). */
const PULL_JS = `
(function () {
  if (window.__vdPull) return;
  window.__vdPull = true;
  var startY = 0;
  var startX = 0;
  var startT = 0;
  var active = false;
  var fired = false;
  function atTop() {
    var y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    return y <= 3;
  }
  function post() {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        source: 'vd-browser', type: 'pull-refresh',
      }));
    } catch (e) {}
  }
  document.addEventListener('touchstart', function (e) {
    fired = false;
    if (!atTop()) { active = false; return; }
    active = true;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    startT = Date.now();
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!active || fired) return;
    var dy = e.touches[0].clientY - startY;
    var dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx * 1.2 > dy) return;
    // iOS reports negative scrollY while rubber-banding — real content
    // overscroll is the strongest signal when the page exposes it.
    var over = -(window.scrollY || 0);
    var dt = Date.now() - startT;
    var flick = dy > 28 && dt < 320;
    var far = dy > 50;
    if (flick || far || over > 24) {
      fired = true;
      active = false;
      post();
    }
  }, { passive: true });
  // Re-arm at gesture end: if the UI swallowed the trigger (spinner window),
  // the next pull must still work instead of latching dead until a reload.
  document.addEventListener('touchend', function () { active = false; fired = false; }, { passive: true });
  document.addEventListener('touchcancel', function () { active = false; fired = false; }, { passive: true });
})();
true;
`;

export default function App() {
  const uiRef = useRef<WebView>(null);
  const webviewRefs = useRef<Record<string, WebView | null>>({});
  // Native back/forward capability per tab (from onNavigationStateChange —
  // v13's imperative ref doesn't expose canGoBack/canGoForward).
  const navCapsRef = useRef<Record<string, { canGoBack: boolean; canGoForward: boolean }>>({});
  const detectedRef = useRef<Set<string>>(new Set());
  const historiesRef = useRef<Record<string, TabHistory>>({});

  const [tabs, setTabs] = useState<ShellTab[]>([{ id: 'tab-1', url: '', title: 'Start' }]);
  const [activeIndex, setActiveIndex] = useState(0);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  // Last-activation timestamps for the alive-set LRU (see MAX_ALIVE_TABS).
  const seenRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const t = tabs[activeIndex];
    if (t?.url) seenRef.current[t.id] = Date.now();
  }, [activeIndex, tabs]);
  const [pane, setPane] = useState<PaneRect | null>(null);
  // Visual state of the native nav rail (screen + badges), pushed by the UI.
  const [rail, setRail] = useState<{
    screen: string;
    dlActive: number;
    dlFailed: boolean;
    libNew: boolean;
    dlDot: boolean;
  }>({ screen: 'browse', dlActive: 0, dlFailed: false, libNew: false, dlDot: false });
  // Nav-rail slide: 0 = out (visible), 1 = tucked under the left edge.
  const railX = useRef(new Animated.Value(0)).current;
  const [railOut, setRailOut] = useState(true);
  const hideRail = useCallback(() => {
    setRailOut(false);
    Animated.timing(railX, {
      toValue: 1,
      duration: 260,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [railX]);
  const showRail = useCallback(() => {
    setRailOut(true);
    Animated.spring(railX, {
      toValue: 0,
      speed: 18,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [railX]);
  // Any touch inside a browsing page tucks the rail; back on home it returns.
  // (Effect body sits below, after `paneVisible` is declared.)
  // Last non-null slot rect — when the UI hides the pane (home) we keep
  // fading OUT AT the slot position instead of jumping to full screen.
  const lastRectRef = useRef<PaneRect | null>(null);
  if (pane) lastRectRef.current = pane;

  // The browser is invisible until the UI reveals it inside its slot
  // (slow stretch from the top edge, matching the design's `done` phase),
  // and fades out again on the return sweep.
  const paneVisible = !!pane?.visible;
  useEffect(() => {
    if (!paneVisible) showRail();
  }, [paneVisible, showRail]);
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: paneVisible ? 1 : 0,
      duration: paneVisible ? 420 : 220,
      easing: paneVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [paneVisible, reveal]);

  const activeTab = tabs[activeIndex] ?? tabs[0];
  const activeHistory = activeTab ? historiesRef.current[activeTab.id] : undefined;

  const relayToUi = useCallback((type: string, payload: unknown) => {
    const json = JSON.stringify({ source: 'vd-native', type, payload });
    uiRef.current?.injectJavaScript(
      `window.postMessage(${json}, '*'); true;`,
    );
  }, []);

  /** Push navState for a browsing tab (chevrons + per-tab page URL in the UI). */
  const relayNavState = useCallback(
    (tabIndex: number, url: string, title?: string) => {
      const tab = tabsRef.current[tabIndex];
      if (!tab) return;
      const hist = historiesRef.current[tab.id] ?? { stack: [tab.currentUrl || url].filter(Boolean), index: 0 };
      relayToUi('navState', {
        tabIndex,
        url,
        title,
        canGoBack: hist.index > 0,
        canGoForward: hist.index < hist.stack.length - 1,
      });
    },
    [relayToUi],
  );

  const handleBrowserNav = useCallback(
    (nav: WebViewNavigation, tabId: string) => {
      const list = tabsRef.current;
      const idx = list.findIndex((t) => t.id === tabId);
      const tab = idx >= 0 ? list[idx] : undefined;
      if (!tab || !nav.url || nav.url === 'about:blank') return;
      navCapsRef.current[tabId] = { canGoBack: nav.canGoBack, canGoForward: nav.canGoForward };
      // Mirror navigation into the tab's history stack; a native back/forward
      // lands on an existing entry — move the cursor instead of pushing.
      const hist = historiesRef.current[tabId];
      if (!hist) {
        historiesRef.current[tabId] = { stack: [nav.url], index: 0 };
      } else if (hist.stack[hist.index - 1] === nav.url) {
        historiesRef.current[tabId] = { ...hist, index: hist.index - 1 };
      } else if (hist.stack[hist.index + 1] === nav.url) {
        historiesRef.current[tabId] = { ...hist, index: hist.index + 1 };
      } else if (hist.stack[hist.index] !== nav.url) {
        historiesRef.current[tabId] = {
          stack: [...hist.stack.slice(0, hist.index + 1), nav.url],
          index: hist.index + 1,
        };
      }
      // Live page URL + title for the UI. `url` (the source driver) stays at
      // the entry URL — updating it here would re-drive the WebView.
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, currentUrl: nav.url, title: t.title || nav.title || nav.url } : t,
        ),
      );
      relayNavState(idx, nav.url, nav.title);
    },
    [relayNavState],
  );

  // Switching tabs re-pushes the target tab's live URL so the web's per-tab
  // mirror re-stamps (switch-backs use it to avoid re-navigating the page).
  useEffect(() => {
    const t = tabsRef.current[activeIndex];
    if (t?.currentUrl) relayNavState(activeIndex, t.currentUrl, t.title);
  }, [activeIndex, relayNavState]);

  const handleBrowserMessage = useCallback(
    (event: WebViewMessageEvent, tabId: string) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          source?: string;
          type?: string;
          payload?: { url?: string; kind?: string; title?: string; ua?: string };
        };
        if (msg.source === 'vd-browser' && msg.type === 'detect' && msg.payload?.url) {
          // Dedupe: the sniffer re-reports the same resources every poll.
          if (detectedRef.current.has(msg.payload.url)) return;
          detectedRef.current.add(msg.payload.url);
          if (detectedRef.current.size > 200) {
            const first = detectedRef.current.values().next().value;
            if (first) detectedRef.current.delete(first);
          }
          relayToUi('detect', {
            url: msg.payload.url,
            kind: msg.payload.kind || 'video',
            title: msg.payload.title,
            tabId,
          });
        } else if (msg.source === 'vd-browser' && msg.type === 'pull-refresh') {
          // Overscroll-at-top inside the browsing page -> let the UI run its
          // refresh flow (spinner + requestReload), single reload path.
          console.log('[vd] pull-refresh | tab:', tabId);
          relayToUi('pullRefresh', {});
        } else if (msg.source === 'vd-browser' && msg.type === 'interact') {
          hideRail();
        } else if (msg.source === 'vd-browser' && msg.type === 'ua') {
          // Confirms the UA the page actually sees (customUserAgent only
          // applies on load — this catches stale-prop or cookie-pinning bugs).
          console.log('[vd] page UA |', msg.payload?.ua ?? '?');
        }
      } catch {
        /* non-envelope message from page */
      }
    },
    [hideRail, relayToUi],
  );

  const handleUiMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: { type?: string; payload?: unknown };
      try {
        msg = JSON.parse(event.nativeEvent.data) as { type?: string; payload?: unknown };
      } catch {
        return;
      }
      switch (msg.type) {
        case 'log': {
          const p = msg.payload as { msg?: string } | undefined;
          console.log('[vd-web]', p?.msg ?? '');
          break;
        }
        case 'navigate': {
          const payload = msg.payload as { url?: string } | undefined;
          const url = payload?.url;
          if (!url || !activeTab) break;
          console.log('[vd] navigate', url, '| tabs:', tabs.length, 'active:', activeIndex);
          const hist = historiesRef.current[activeTab.id];
          if (hist) {
            historiesRef.current[activeTab.id] = {
              stack: [...hist.stack.slice(0, hist.index + 1), url],
              index: hist.index + 1,
            };
          } else {
            historiesRef.current[activeTab.id] = { stack: [url], index: 0 };
          }
          setTabs((prev) =>
            prev.map((t, i) => (i === activeIndex ? { ...t, url, currentUrl: url, title: url } : t)),
          );
          break;
        }
        case 'syncTabs': {
          const payload = msg.payload as
            | { tabs?: ShellTab[]; activeIndex?: number }
            | undefined;
          if (!Array.isArray(payload?.tabs) || payload.tabs.length === 0) break;
          console.log('[vd] syncTabs', payload.tabs.length, 'active:', payload.activeIndex, payload.tabs.map((t) => t.title || t.url || '-').join(' | '));
          // Merge by id: known tabs keep the shell's live page (their WebView
          // stays mounted — web's url field is just a mirror); adopt web's
          // order + titles. New ids adopt web's url as their entry URL.
          const next: ShellTab[] = payload.tabs.map((wt) => {
            const existing = tabs.find((t) => t.id === wt.id);
            return existing
              ? { ...existing, title: wt.title || existing.title }
              : { id: wt.id, url: wt.url || '', title: wt.title, currentUrl: wt.url || undefined };
          });
          setTabs(next);
          const nextActive = Math.max(0, Math.min(payload.activeIndex ?? 0, next.length - 1));
          setActiveIndex(nextActive);
          break;
        }
        case 'switchTab': {
          const payload = msg.payload as { index?: number } | undefined;
          if (typeof payload?.index === 'number') {
            console.log('[vd] switchTab ->', payload.index);
            setActiveIndex(Math.max(0, Math.min(payload.index, tabs.length - 1)));
          }
          break;
        }
        case 'newTab': {
          console.log('[vd] newTab | was:', tabs.length, tabs.map((t) => t.title || t.url || '-').join(' | '));
          setTabs((prev) =>
            prev.length >= 10
              ? prev
              : [...prev, { id: `shell-${Date.now()}`, url: '', title: 'New Tab' }],
          );
          setActiveIndex((i) => i); // syncTabs will align the real active id
          break;
        }
        case 'closeTab': {
          const payload = msg.payload as { index?: number } | undefined;
          if (typeof payload?.index === 'number' && tabs.length > 1) {
            console.log('[vd] closeTab', payload.index, '| was:', tabs.length);
            const next = tabs.filter((_, i) => i !== payload.index);
            setTabs(next);
            setActiveIndex((i) => Math.max(0, Math.min(i >= payload.index! ? i - 1 : i, next.length - 1)));
          }
          break;
        }
        case 'reload': {
          const wv = activeTab ? webviewRefs.current[activeTab.id] : undefined;
          console.log('[vd] reload', activeTab?.currentUrl ?? activeTab?.url ?? '');
          wv?.reload();
          break;
        }
        case 'goBack': {
          const tab = activeTab;
          if (!tab) break;
          const wv = webviewRefs.current[tab.id];
          const hist = historiesRef.current[tab.id];
          const caps = navCapsRef.current[tab.id];
          if (hist && hist.index > 0) {
            if (wv && caps?.canGoBack) {
              // Prefer WKWebView's own history: page state (scroll, DOM,
              // media) survives; the nav event moves the stack cursor.
              wv.goBack();
              break;
            }
            const nextIndex = hist.index - 1;
            historiesRef.current[tab.id] = { ...hist, index: nextIndex };
            const url = hist.stack[nextIndex];
            setTabs((prev) =>
              prev.map((t, i) => (i === activeIndex ? { ...t, url, currentUrl: url } : t)),
            );
            relayNavState(activeIndex, url);
          } else if (wv && caps?.canGoBack) {
            wv.goBack();
          }
          break;
        }
        case 'goForward': {
          const tab = activeTab;
          if (!tab) break;
          const wv = webviewRefs.current[tab.id];
          const hist = historiesRef.current[tab.id];
          const caps = navCapsRef.current[tab.id];
          if (hist && hist.index < hist.stack.length - 1) {
            if (wv && caps?.canGoForward) {
              wv.goForward();
              break;
            }
            const nextIndex = hist.index + 1;
            historiesRef.current[tab.id] = { ...hist, index: nextIndex };
            const url = hist.stack[nextIndex];
            setTabs((prev) =>
              prev.map((t, i) => (i === activeIndex ? { ...t, url, currentUrl: url } : t)),
            );
            relayNavState(activeIndex, url);
          } else if (wv && caps?.canGoForward) {
            wv.goForward();
          }
          break;
        }
        case 'browserPane': {
          const next = (msg.payload as PaneRect | undefined) ?? null;
          setPane((prev) => {
            if (prev === null && next === null) return prev;
            if (prev !== null && next !== null &&
                prev.x === next.x && prev.y === next.y &&
                prev.w === next.w && prev.h === next.h &&
                !!prev.visible === !!next.visible &&
                (!!prev.frame === !!next.frame) &&
                (!prev.frame || !next.frame ||
                  (prev.frame.x === next.frame.x && prev.frame.y === next.frame.y &&
                   prev.frame.w === next.frame.w && prev.frame.h === next.frame.h))) {
              return prev;
            }
            console.log('[vd] pane', next
              ? `${next.x},${next.y} ${next.w}x${next.h} vis=${!!next.visible}` +
                (next.frame ? ` frame=${next.frame.w}x${next.frame.h}@${next.frame.x},${next.frame.y}` : '')
              : 'hidden');
            return next;
          });
          break;
        }
        case 'rail': {
          const p = msg.payload as
            | { screen?: string; dlActive?: number; dlFailed?: boolean; libNew?: boolean; dlDot?: boolean }
            | undefined;
          if (!p) break;
          setRail({
            screen: p.screen ?? 'browse',
            dlActive: p.dlActive ?? 0,
            dlFailed: !!p.dlFailed,
            libNew: !!p.libNew,
            dlDot: !!p.dlDot,
          });
          break;
        }
        default:
          console.log('[shell]', msg.type, msg.payload ?? '');
      }
    },
    [activeIndex, activeTab, relayNavState, tabs],
  );

  // Alive set: the active tab (if it has a page) plus the MAX_ALIVE_TABS-1
  // most recently seen others. Tabs outside the set are evicted (unmounted)
  // to respect the RAM budget.
  const aliveIds = useMemo(() => {
    const alive = new Set<string>();
    const active = tabs[activeIndex];
    if (active?.url) alive.add(active.id);
    const others = tabs
      .filter((t) => !!t.url && t.id !== active?.id)
      .sort((a, b) => (seenRef.current[b.id] ?? 0) - (seenRef.current[a.id] ?? 0))
      .slice(0, Math.max(0, MAX_ALIVE_TABS - alive.size));
    for (const t of others) alive.add(t.id);
    return alive;
  }, [tabs, activeIndex]);

  // Before an evicted tab unmounts, promote its live page URL to the entry
  // URL — re-activating it resumes where it was instead of the first page.
  const prevAliveRef = useRef(aliveIds);
  useEffect(() => {
    const evicted = [...prevAliveRef.current].filter((id) => !aliveIds.has(id));
    prevAliveRef.current = aliveIds;
    if (evicted.length === 0) return;
    setTabs((cur) =>
      cur.map((t) =>
        evicted.includes(t.id) && t.currentUrl && t.currentUrl !== t.url
          ? { ...t, url: t.currentUrl }
          : t,
      ),
    );
  }, [aliveIds]);

  // Floating download button: draggable anywhere, but X always springs back
  // to the right edge (the "magnet"); Y stays where it was dropped.
  const fabPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const fabStartRef = useRef({ x: 0, y: 0 });
  const fabMovedRef = useRef(false);
  const fabPosRef = useRef({ x: 0, y: 0 });
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          fabMovedRef.current = false;
          fabStartRef.current = { ...fabPosRef.current };
          fabPan.setValue(fabStartRef.current);
        },
        onPanResponderMove: (_evt, g) => {
          if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) fabMovedRef.current = true;
          fabPan.setValue({ x: fabStartRef.current.x + g.dx, y: fabStartRef.current.y + g.dy });
        },
        onPanResponderRelease: (_evt, g) => {
          // Base sits at bottom:200 / right:20 — clamp Y so the 70px button
          // stays fully on screen (12px margin), and magnet X back to the edge.
          const H = Dimensions.get('window').height;
          const yRaw = fabStartRef.current.y + g.dy;
          const yMin = 12 - (H - 200 - 70);
          const yMax = 200 - 12;
          const next = { x: 0, y: Math.max(yMin, Math.min(yMax, yRaw)) };
          fabPosRef.current = next;
          Animated.spring(fabPan, {
            toValue: next,
            speed: 22,
            bounciness: 10,
            useNativeDriver: true,
          }).start();
          if (!fabMovedRef.current) relayToUi('rail', { item: 'download' });
        },
      }),
    [fabPan, relayToUi],
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* UI chrome WebView — the whole app UI. */}
      <WebView
        ref={uiRef}
        originWhitelist={['*']}
        source={{ html: WEB_HTML, baseUrl: 'https://vd.local/' }}
        onMessage={handleUiMessage}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        style={styles.web}
      />

      {/* Browsing WebViews — one per alive tab, drawn above the UI but
          confined to the slot rect the UI reports. The ACTIVE tab's WebView
          is positioned in the slot; the others are display:none (kept alive,
          page state intact) so switching tabs is instant. */}
      {tabs.some((t) => t.url) && (() => {
        const r = pane ?? lastRectRef.current;
        // While `rdown` clips the wrapper to the wipe region, the WebViews'
        // frame stays STATIC at the full slot (`frame`), shifted upward inside
        // the wrapper — only the wrapper's bounds animate, so the page's
        // viewport never resizes mid-wipe (that relayout caused visible lag
        // and made pages like Google self-reload mid-animation).
        const fr = r?.frame;
        return (
          <Animated.View
            pointerEvents={paneVisible ? 'auto' : 'none'}
            style={[
              styles.browser,
              r
                ? { left: r.x, top: r.y, width: r.w, height: r.h }
                : styles.browserHidden,
            {
              opacity: reveal,
              // RN has no transformOrigin — a bare scaleY shrinks around the
              // CENTER, dipping the pane's top edge ~3% of its height on every
              // reveal. Pair it with a translateY so the scale pins to the top.
              transform: [
                {
                  translateY: reveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-0.03 * ((r && r.h) || 0), 0],
                  }),
                },
                { scaleY: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
              ],
            },
            ]}
          >
          {tabs.map((tab, idx) => {
            if (!tab.url || !aliveIds.has(tab.id)) return null;
            const isActive = idx === activeIndex;
            const tabId = tab.id;
            return (
              <WebView
                key={tabId}
                ref={(w: WebView | null) => {
                  webviewRefs.current[tabId] = w;
                }}
                style={[
                  styles.browserWeb,
                  !isActive && styles.browserWebHidden,
                  isActive && fr && r
                    ? { left: fr.x - r.x, top: fr.y - r.y, width: fr.w, height: fr.h }
                    : null,
                ]}
                source={{ uri: tab.url }}
                originWhitelist={['*']}
                userAgent={SAFARI_UA}
                injectedJavaScript={SNIFFER_JS}
                injectedJavaScriptBeforeContentLoaded={PULL_JS}
                onMessage={(e) => handleBrowserMessage(e, tabId)}
                onNavigationStateChange={(nav) => handleBrowserNav(nav, tabId)}
                onShouldStartLoadWithRequest={(req) => {
                  if (req.isTopFrame === false) return true;
                  const fixed = rewriteMobileUrl(req.url);
                  if (fixed && fixed !== tab.url) {
                    console.log('[vd] mobile host rewrite |', req.url, '->', fixed);
                    setTabs((prev) =>
                      prev.map((t, i) => (i === idx ? { ...t, url: fixed, currentUrl: fixed } : t)),
                    );
                    return false;
                  }
                  return true;
                }}
                onLoadStart={() => {
                  console.log('[vd] browser load start', tabId, tab.url);
                  relayToUi('pageLoad', { tabIndex: idx, state: 'start' });
                }}
                onLoadEnd={() => {
                  console.log('[vd] browser load end', tabId, tab.url);
                  relayToUi('pageLoad', { tabIndex: idx, state: 'end' });
                }}
                onError={(e) =>
                  relayToUi('pageLoad', {
                    tabIndex: idx,
                    state: 'error',
                    message: e.nativeEvent.description || 'Couldn\u2019t load that page',
                  })
                }
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                setSupportMultipleWindows={false}
              />
            );
          })}
          </Animated.View>
        );
      })()}

      {/* Native nav rail — always above every WebView layer (chrome-over-
          content parity with the iOS shell). Tucks under the left edge on
          page interaction; the > handle slides it back out. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.rail,
          {
            transform: [
              {
                translateX: railX.interpolate({ inputRange: [0, 1], outputRange: [0, -90] }),
              },
            ],
          },
        ]}
      >
        <View style={styles.railCol}>
          <Pressable
            onPress={() => relayToUi('rail', { item: 'home' })}
            style={[styles.railBtn, rail.screen === 'browse' && styles.railBtnOn]}
          >
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={rail.screen === 'browse' ? '#d7ccff' : '#c9cfdb'} strokeWidth={1.8}>
              <Circle cx="12" cy="12" r="9" />
              <Path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
            </Svg>
          </Pressable>
          <Pressable
            onPress={() => relayToUi('rail', { item: 'down' })}
            style={[styles.railBtn, rail.screen === 'down' && styles.railBtnOn]}
          >
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={rail.screen === 'down' ? '#d7ccff' : '#c9cfdb'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" />
            </Svg>
            {rail.dlActive > 0 && (
              <View
                style={[
                  styles.railBadge,
                  { backgroundColor: rail.dlFailed ? '#ff7a9c' : '#3ecf8e' },
                ]}
              >
                <Text style={styles.railBadgeText}>{rail.dlActive}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => relayToUi('rail', { item: 'lib' })}
            style={[styles.railBtn, rail.screen === 'lib' && styles.railBtnOn]}
          >
            <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={rail.screen === 'lib' ? '#d7ccff' : '#c9cfdb'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Rect x="3" y="5" width="18" height="14" rx="3" />
              <Path d="M10 9.5v5l4.5-2.5z" />
            </Svg>
            {rail.libNew && <View style={styles.railDot} />}
          </Pressable>
        </View>
      </Animated.View>

      {/* Rail restore handle — visible only while the rail is tucked. */}
      <Animated.View
        pointerEvents={railOut ? 'none' : 'auto'}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
          zIndex: 12,
          opacity: railX,
        }}
      >
        <Pressable onPress={showRail} style={styles.railHandle} hitSlop={10}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#e8eaf0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 6l6 6-6 6" />
          </Svg>
        </Pressable>
      </Animated.View>

      {/* Floating download button — magnet-stuck to the right edge, draggable
          vertically; tap toggles the format sheet in the UI. */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.fab,
          { transform: [{ translateX: fabPan.x }, { translateY: fabPan.y }] },
        ]}
      >
        <View {...panResponder.panHandlers} style={styles.fabBtn}>
          <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 3v12" />
            <Path d="M7 10l5 5 5-5" />
            <Path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </Svg>
          {rail.dlDot && <View style={styles.fabDot} />}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0f14',
  },
  browser: {
    position: 'absolute',
    backgroundColor: '#0e0f14',
    borderRadius: 18,
    overflow: 'hidden',
  },
  browserHidden: {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  browserWeb: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#0e0f14',
  },
  browserWebHidden: {
    display: 'none',
  },
  web: {
    backgroundColor: 'transparent',
  },
  rail: {
    position: 'absolute',
    left: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 10,
  },
  railCol: {
    flexDirection: 'column',
    gap: 14,
  },
  railBtn: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    // Omnicolor: translucent dark chip keeps the icon readable over any page.
    backgroundColor: 'rgba(22,24,34,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  railBtnOn: {
    backgroundColor: '#3a2f78',
    borderColor: 'rgba(183,166,255,0.5)',
  },
  railHandle: {
    width: 30,
    height: 72,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: 'rgba(22,24,34,0.82)',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 3,
    shadowOffset: { width: 2, height: 2 },
    elevation: 6,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 200,
    zIndex: 11,
  },
  fabBtn: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: '#6c47eb',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7c5cff',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34d399',
    borderWidth: 2,
    borderColor: '#0e0f14',
  },
  railBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  railBadgeText: {
    color: '#06130d',
    fontSize: 12,
    fontWeight: '700',
  },
  railDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7c5cff',
  },
});
