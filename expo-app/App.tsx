import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
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
 * URL history stack for back/forward. Only the ACTIVE tab's browsing
 * WebView is mounted (iPad 6th gen RAM budget).
 */

const SAFARI_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1';

interface ShellTab {
  id: string;
  url: string;
  title?: string;
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
}

/** Injected into every browsing page: sniff <video> srcs and .m3u8 traffic. */
const SNIFFER_JS = `
(function () {
  if (window.__vdSniff) return;
  window.__vdSniff = true;
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
})();
true;
`;

export default function App() {
  const uiRef = useRef<WebView>(null);
  const browserRef = useRef<WebView>(null);
  const detectedRef = useRef<Set<string>>(new Set());
  const historiesRef = useRef<Record<string, TabHistory>>({});

  const [tabs, setTabs] = useState<ShellTab[]>([{ id: 'tab-1', url: '', title: 'Start' }]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pane, setPane] = useState<PaneRect | null>(null);

  // The browser is invisible until the UI reveals it inside its slot
  // (fade + 16px slide, matching the design's `done` phase), and fades out
  // again on the return sweep.
  const paneVisible = !!pane?.visible;
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: paneVisible ? 1 : 0,
      duration: paneVisible ? 350 : 220,
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

  /** Push navState for the active browsing tab (chevrons + pill titles). */
  const relayNavState = useCallback(
    (url: string, title?: string) => {
      const tab = tabs[activeIndex];
      if (!tab) return;
      const hist = historiesRef.current[tab.id] ?? { stack: [tab.url || url].filter(Boolean), index: 0 };
      relayToUi('navState', {
        tabIndex: activeIndex,
        url,
        title,
        canGoBack: hist.index > 0,
        canGoForward: hist.index < hist.stack.length - 1,
      });
    },
    [activeIndex, relayToUi, tabs],
  );

  const handleBrowserNav = useCallback(
    (nav: WebViewNavigation) => {
      const tab = tabs[activeIndex];
      if (!tab || !nav.url || nav.url === 'about:blank') return;
      // Mirror in-page navigation into the tab's history stack.
      const hist = historiesRef.current[tab.id];
      if (!hist) {
        historiesRef.current[tab.id] = { stack: [nav.url], index: 0 };
      } else if (hist.stack[hist.index] !== nav.url) {
        historiesRef.current[tab.id] = {
          stack: [...hist.stack.slice(0, hist.index + 1), nav.url],
          index: hist.index + 1,
        };
      }
      // Live title/url for the UI tab strip.
      setTabs((prev) =>
        prev.map((t, i) => (i === activeIndex ? { ...t, url: nav.url, title: t.title || nav.title || nav.url } : t)),
      );
      relayNavState(nav.url, nav.title);
    },
    [activeIndex, relayNavState, tabs],
  );

  const handleBrowserMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          source?: string;
          type?: string;
          payload?: { url?: string; kind?: string; title?: string };
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
            tabId: tabs[activeIndex]?.id,
          });
        }
      } catch {
        /* non-envelope message from page */
      }
    },
    [activeIndex, relayToUi, tabs],
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
        case 'navigate': {
          const payload = msg.payload as { url?: string } | undefined;
          const url = payload?.url;
          if (!url || !activeTab) break;
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
            prev.map((t, i) => (i === activeIndex ? { ...t, url, title: url } : t)),
          );
          break;
        }
        case 'syncTabs': {
          const payload = msg.payload as
            | { tabs?: ShellTab[]; activeIndex?: number }
            | undefined;
          if (Array.isArray(payload?.tabs) && payload.tabs.length > 0) {
            // Preserve per-tab histories; adopt web's ordering + urls.
            setTabs(payload.tabs);
            const nextActive = Math.min(payload.activeIndex ?? 0, payload.tabs.length - 1);
            setActiveIndex(Math.max(0, nextActive));
          }
          break;
        }
        case 'switchTab': {
          const payload = msg.payload as { index?: number } | undefined;
          if (typeof payload?.index === 'number') {
            setActiveIndex(Math.max(0, Math.min(payload.index, tabs.length - 1)));
          }
          break;
        }
        case 'newTab': {
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
            const next = tabs.filter((_, i) => i !== payload.index);
            setTabs(next);
            setActiveIndex((i) => Math.max(0, Math.min(i >= payload.index! ? i - 1 : i, next.length - 1)));
          }
          break;
        }
        case 'reload': {
          browserRef.current?.reload();
          break;
        }
        case 'goBack': {
          const hist = activeTab ? historiesRef.current[activeTab.id] : undefined;
          if (hist && hist.index > 0) {
            const nextIndex = hist.index - 1;
            historiesRef.current[activeTab.id] = { ...hist, index: nextIndex };
            const url = hist.stack[nextIndex];
            setTabs((prev) =>
              prev.map((t, i) => (i === activeIndex ? { ...t, url } : t)),
            );
            relayNavState(url);
          } else {
            browserRef.current?.goBack();
          }
          break;
        }
        case 'goForward': {
          const hist = activeTab ? historiesRef.current[activeTab.id] : undefined;
          if (hist && hist.index < hist.stack.length - 1) {
            const nextIndex = hist.index + 1;
            historiesRef.current[activeTab.id] = { ...hist, index: nextIndex };
            const url = hist.stack[nextIndex];
            setTabs((prev) =>
              prev.map((t, i) => (i === activeIndex ? { ...t, url } : t)),
            );
            relayNavState(url);
          } else {
            browserRef.current?.goForward();
          }
          break;
        }
        case 'browserPane': {
          setPane((msg.payload as PaneRect | undefined) ?? null);
          break;
        }
        default:
          console.log('[shell]', msg.type, msg.payload ?? '');
      }
    },
    [activeIndex, activeTab, relayNavState, tabs],
  );

  // The browsing WebView: mounted only when the active tab has a URL.
  const browserSource = useMemo(
    () => (activeTab?.url ? { uri: activeTab.url } : null),
    [activeTab?.url],
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

      {/* Browsing WebView — drawn above the UI but confined to the slot rect
          the UI reports, so the page sits INSIDE the layout under the top
          bar and stays touchable. Invisible (and untouchable) until the UI
          reveals it; hidden entirely on home. */}
      {browserSource && (
        <Animated.View
          pointerEvents={paneVisible ? 'auto' : 'none'}
          style={[
            styles.browser,
            pane
              ? { left: pane.x, top: pane.y, width: pane.w, height: pane.h }
              : styles.browserHidden,
            {
              opacity: reveal,
              transform: [
                { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
              ],
            },
          ]}
        >
          <WebView
            key={activeTab.id}
            ref={browserRef}
            source={browserSource}
            originWhitelist={['*']}
            userAgent={SAFARI_UA}
            injectedJavaScript={SNIFFER_JS}
            onMessage={handleBrowserMessage}
            onNavigationStateChange={handleBrowserNav}
            onLoadStart={() =>
              relayToUi('pageLoad', { tabIndex: activeIndex, state: 'start' })
            }
            onLoadEnd={() => relayToUi('pageLoad', { tabIndex: activeIndex, state: 'end' })}
            onError={(e) =>
              relayToUi('pageLoad', {
                tabIndex: activeIndex,
                state: 'error',
                message: e.nativeEvent.description || 'Couldn\u2019t load that page',
              })
            }
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            setSupportMultipleWindows={false}
            style={styles.browserWeb}
          />
        </Animated.View>
      )}
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
    flex: 1,
    backgroundColor: '#0e0f14',
  },
  web: {
    backgroundColor: 'transparent',
  },
});
