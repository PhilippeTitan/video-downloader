import React from 'react'
import { hasNativeShell, requestGoBack, requestGoForward, requestBrowserPane, requestReload, onNavState, onPageLoad, requestNavigation, requestSyncTabs, debugLog, sendNativeAction } from './bridge'
import type { BrowserPaneRect } from './bridge'

interface FavItem {
  label: string
  letter: string
  url: string
  bg: string
  ink: string
}

interface LibItem {
  id: string
  title: string
  fmt: string
  size: string
  when: string
  dur: string
  audio: boolean
  mb: number
  isNew?: boolean
  src: string
  prog?: number
  priv?: boolean
  missing?: boolean
  real?: number
}

interface JobItem {
  id: number
  title: string
  fmtLabel: string
  pct: number
  speedBps?: number
  status: 'downloading' | 'done' | 'paused' | 'failed'
  src?: string
  audio?: boolean
}

interface TabItem {
  id: number
  text: string
  priv?: boolean
  /** Entry/live page URL for this tab. The native shell keeps the tab's
   *  browsing WebView alive across switches, so this must hold the URL the
   *  WebView should mount at — NOT a re-resolved search (no reloads). */
  url?: string
}

interface SeqState {
  key: string
  text: string
  phase: 'fade' | 'scan' | 'load' | 'done' | 'rdown' | 'rup' | 'rfade'
  t0?: number
  skip?: boolean
  /** Re-search / restore from a live page: keep the pane revealed through
   *  `load` instead of hiding it (the page must stay on top). */
  keepUp?: boolean
}

interface FormatOption {
  id: string
  label: string
  meta: string
}

interface DetectedVideo {
  url: string
  title: string
  thumbnail?: string
  durationSec?: number
  formats: FormatOption[]
}

interface DhRow {
  title: string
  fmt: string
  when: string
  status: string
  ink: string
}

interface AppState {
  sc: Record<string, { t: number; h: number; c: number; at: number }>
  scv: number
  dh: boolean
  dhc: boolean
  dhRows: DhRow[]
  lf: number
  ld: string | null
  dr: string[]
  lib: LibItem[]
  dp: string[]
  dx: string | null
  dm: boolean
  dmc: boolean
  cell: string[]
  lm: boolean
  lay: 'list' | 'cards'
  lq: string
  hmenu: string | null
  sel: boolean
  selIds: string[]
  selConf: boolean
  stOpen: boolean
  info: string | null
  swm: boolean
  pm: boolean
  pmp: number
  cpriv: boolean
  pv: number
  tmc: boolean
  caOn: boolean
  cax: number
  tm: boolean
  tmp: number
  dw: boolean
  dwp: number
  hb: number
  ci: number
  tsp: number
  tsph: string
  sf: number
  pa: number
  pb: number
  nph: string
  npp: number
  cl: { id: string } | null
  cf: number
  pt: number
  nz: { x: number; y: number; w: number; h: number; base: any } | null
  nzph: string
  nzp: number
  nzf: number
  hist: string[]
  histClearedToast?: boolean
  hm: boolean
  hmp: number
  hop: number
  screen: 'browse' | 'down' | 'lib'
  sheet: boolean
  fmt: string
  jobs: JobItem[]
  playing: string
  playingMedia: { url: string; title: string; audio: boolean } | null
  seq: SeqState | null
  sp: number
  q: string
  tabs: TabItem[]
  sw: boolean
  swp: number
  swt: number
  adding: boolean
  mp: number
  gp: number
  pick: number
  newId: string
  fx: number
  rx: number
  favs: FavItem[]
  scale: number
  vw: number
  vh: number
  detectedVideo: DetectedVideo | null
  webviewSrc: string
  webviewUrl: string
  searchFocused: boolean
  canGoBackNative?: boolean
  canGoForwardNative?: boolean
  pullY: number
  isPulling: boolean
  isRefreshing: boolean
  refreshKey: number
  refreshedToast: boolean
  draggingTabIdx: number | null
  dragTabOffset: number
  stripW: { fav: number; rec: number }
  barW: { home: number; dock: number }
  /** Height of the browse content area — drives the reverse (home) sweep geometry. */
  mainH: number
}

const STORAGE_KEY_LIB = 'vd-downloads-v1'
const STORAGE_KEY_HIST = 'vd-visited-v1'
const STORAGE_KEY_FAVS = 'vd-favs-v1'
const STORAGE_KEY_DH = 'vd-dl-history-v1'

const DEFAULT_FAVS: FavItem[] = []

function getDisplayDomain(urlOrQuery: string): string {
  if (!urlOrQuery) return ''
  const trimmed = urlOrQuery.trim()
  if (!trimmed) return ''

  if (trimmed.includes('google.') || trimmed.includes('google.com')) return 'google.com'
  if (trimmed.includes('bing.') || trimmed.includes('bing.com')) return 'bing.com'
  if (trimmed.includes('youtube.') || trimmed.includes('youtu.be')) return 'youtube.com'

  try {
    const raw = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`
    const u = new URL(raw)
    let host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (host.includes('google.')) return 'google.com'
    if (host.includes('bing.')) return 'bing.com'
    if (host.includes('youtube.') || host.includes('youtu.be')) return 'youtube.com'
    if (host) return host
  } catch {}

  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(trimmed)) {
    return trimmed.split('/')[0].replace(/^www\./, '')
  }

  // Search query maps to Google
  return 'google.com'
}

function resolveWebTarget(text: string): { src: string; url: string; domain: string } {
  const txt = text.trim()
  if (!txt) return { src: '', url: '', domain: '' }

  const ytMatch = txt.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) {
    return {
      src: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&enablejsapi=1&playsinline=1`,
      url: `https://www.youtube.com/watch?v=${ytMatch[1]}`,
      domain: 'youtube.com',
    }
  }

  if (/\.(mp4|mov|webm|m4v|m3u8)(\?|$)/i.test(txt)) {
    let d = 'media'
    try {
      d = new URL(txt.startsWith('http') ? txt : `https://${txt}`).hostname.replace(/^www\./, '')
    } catch {}
    return { src: txt, url: txt, domain: d }
  }

  if (/^https?:\/\//i.test(txt)) {
    if (txt.includes('youtube.com') || txt.includes('youtu.be')) {
      const vid = txt.match(/(?:v=|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1]
      if (vid) {
        return {
          src: `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&enablejsapi=1&playsinline=1`,
          url: `https://www.youtube.com/watch?v=${vid}`,
          domain: 'youtube.com',
        }
      }
      return { src: `/api/webview-search?q=trending`, url: txt, domain: 'youtube.com' }
    }
    let d = ''
    try {
      d = new URL(txt).hostname.replace(/^www\./, '')
    } catch {}
    return { src: txt, url: txt, domain: d || txt }
  }

  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(txt)) {
    if (txt.includes('youtube.com') || txt.includes('youtu.be')) {
      return { src: `/api/webview-search?q=trending`, url: `https://${txt}`, domain: 'youtube.com' }
    }
    const full = `https://${txt}`
    let d = txt.split('/')[0].replace(/^www\./, '')
    return { src: full, url: full, domain: d }
  }

  // Generic search query (e.g. "dog"): redirect as Google search
  return {
    src: `https://www.google.com/search?q=${encodeURIComponent(txt)}&igu=1`,
    url: `https://www.google.com/search?q=${encodeURIComponent(txt)}`,
    domain: 'google.com',
  }
}

export default class App extends React.Component<{}, AppState> {
  t: any = null
  tick: any = null
  dr: Record<string, boolean> = {}
  act: Record<string, number> = {}
  lxs: Record<string, number> = {}
  mv: Record<string, number> = {}
  cap: Record<string, boolean> = {}
  ht: any = null
  ht2: any = null
  ht3: any = null
  scT: any = null
  pending: FavItem | null = null
  hold = false
  held = false
  held2 = false
  nm = ''
  ad = ''
  lastN?: number
  sfGo = false
  pos: Record<string, { x: number; y: number }> = {}
  pp: Array<{ l: number; w: number }> = []
  afterNew: (() => void) | null = null
  afterTs: (() => void) | null = null
  afterClose: (() => void) | null = null
  privNext = false
  tabHistories: Record<number, { stack: string[]; index: number }> = {}
  unsubNav: (() => void) | null = null
  unsubPageLoad: (() => void) | null = null
  pageLoaded = false
  loadStartedAt = 0
  browserSlotRef = React.createRef<HTMLDivElement>()
  favStripRef = React.createRef<HTMLDivElement>()
  recStripRef = React.createRef<HTMLDivElement>()
  barWrapRef = React.createRef<HTMLDivElement>()
  qInputRef = React.createRef<HTMLInputElement>()
  /** Value the search box must snap back to when it loses focus without a
   *  search running (browser omnibox behavior): captured on focus, replaced
   *  by executeSearch when a query commits. */
  qOrig = ''
  /** Set by the clear button before its programmatic refocus, so onFocus
   *  doesn't recapture qOrig from a transient state. */
  suppressQSnap = false

  measureStrips = () => {
    const fav = this.favStripRef.current?.clientWidth ?? 0
    const rec = this.recStripRef.current?.clientWidth ?? 0
    const host = this.barWrapRef.current?.offsetParent
    const parentW = host instanceof HTMLElement ? host.clientWidth : 0
    const parentH = host instanceof HTMLElement ? host.clientHeight : 0
    const { stripW, barW, mainH } = this.state
    const nextBarW =
      parentW > 0
        ? { home: Math.min(560, parentW - 32), dock: Math.min(492, parentW - 332) }
        : barW
    const nextMainH = parentH > 0 ? parentH : mainH
    if (
      fav !== stripW.fav ||
      rec !== stripW.rec ||
      nextBarW.home !== barW.home ||
      nextBarW.dock !== barW.dock ||
      nextMainH !== mainH
    ) {
      this.setState({ stripW: { fav, rec }, barW: nextBarW, mainH: nextMainH })
    }
  }

  lastPaneKey = ''
  lastRailKey = ''
  lastTickAt = 0
  sheetRef = React.createRef<HTMLElement>()
  sheetSyncTimer: number | null = null

  syncBrowserPane = () => {
    if (!hasNativeShell()) return
    const el = this.browserSlotRef.current
    const s = this.state
    // The browsing WebView is a native layer ABOVE the whole UI, so it must
    // drop while a FULL-SCREEN UI overlay covers the slot: tab switcher,
    // tab quick actions, new-tab zoom, add-favorite modal. The format sheet
    // is bottom-anchored — it clips the pane instead (below).
    const overlayUp = Boolean(
      s.sw || s.swp > 0 ||
      s.tm || s.tmp > 0 ||
      s.nz ||
      s.adding || s.mp > 0
    )
    const phase = s.seq?.phase
    const rdown = phase === 'rdown'
    const isVisible = Boolean(
      s.screen === 'browse' &&
      s.webviewSrc &&
      (!s.seq ||
        phase === 'scan' ||
        phase === 'load' ||
        phase === 'done' ||
        // `rdown` keeps the page up while the bar wipes it away top-down;
        // the pane drops at the rdown -> rup transition (mockup showResults).
        rdown) &&
      !overlayUp
    )
    if (!el || !isVisible) {
      if (this.lastPaneKey !== '') {
        this.lastPaneKey = ''
        requestBrowserPane(null)
      }
      return
    }
    const rect = el.getBoundingClientRect()
    const slot = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    }
    const pane: BrowserPaneRect = {
      ...slot,
      // The page mounts hidden at the final rect during `scan`+`load` (loads
      // while the bar stretches); the shell stretches it in only at `done`.
      // `keepUp`: a re-search from a live page must NOT hide the page — it
      // stays revealed on top through the load.
      visible: !s.seq || phase === 'done' || rdown || (phase === 'load' && !!s.seq.keepUp),
    }
    // Wipe sync: the UI's clip-path can't touch a native layer above us, so
    // clip the pane itself to the region below the descending bar's bottom edge.
    // `frame` keeps the WebView's actual native frame STATIC at the slot —
    // only the overflow-clipping wrapper follows the bar — so the page never
    // relayouts (or self-reloads) mid-wipe.
    if (rdown) {
      const bar = this.barWrapRef.current?.getBoundingClientRect()
      if (bar) {
        const clip = Math.round(bar.bottom - rect.top)
        if (clip > 0) {
          pane.frame = slot
          pane.y = slot.y + clip
          pane.h = Math.max(0, slot.h - clip)
        }
      }
    }
    // Format sheet: bottom-anchored overlay — clip the pane to the region
    // above the sheet (same static-frame wipe) so the page stays ON TOP
    // while the sheet covers the lower screen. Measured mid-slide the sheet
    // rect is still off-screen, so re-sync once its 0.36s animation ends.
    if (s.sheet) {
      const sr = this.sheetRef.current?.getBoundingClientRect()
      if (sr) {
        const clip = Math.round(rect.bottom - sr.top)
        if (clip > 0) {
          pane.frame = pane.frame ?? slot
          pane.h = Math.max(0, pane.h - clip)
        }
      }
      if (this.sheetSyncTimer) clearTimeout(this.sheetSyncTimer)
      this.sheetSyncTimer = setTimeout(() => {
        this.sheetSyncTimer = null
        this.syncBrowserPane()
      }, 400)
    }
    // Only post on actual change — a new message every tick makes the native
    // wrapper re-render and the loading WebView flicker.
    const key = `${pane.x},${pane.y},${pane.w},${pane.h},${pane.visible}${
      pane.frame ? `,f${pane.frame.x},${pane.frame.y},${pane.frame.w},${pane.frame.h}` : ''
    }`
    if (key === this.lastPaneKey) return
    this.lastPaneKey = key
    requestBrowserPane(pane)
  }

  pushTabHistory = (tabId: number, text: string) => {
    if (!text) return
    const h = this.tabHistories[tabId] || { stack: [], index: -1 }
    if (h.index >= 0 && h.stack[h.index] === text) return
    this.tabHistories[tabId] = {
      stack: [...h.stack.slice(0, h.index + 1), text],
      index: h.index + 1,
    }
  }

  goHome = () => {
    if (this.state.screen !== 'browse') {
      this.setState({ screen: 'browse' })
      return
    }
    const { seq, webviewSrc } = this.state
    const ph = seq?.phase
    const pageUp = seq ? ph === 'load' || ph === 'done' : !!webviewSrc
    if (pageUp) {
      if (hasNativeShell()) {
        requestGoBack()
      }
      this.setState({
        seq: seq ? { ...seq, phase: 'rdown' } : { key: 'home', text: '', phase: 'rdown' },
        sp: 0,
      })
    }
  }

  constructor(props: {}) {
    super(props)
    let savedLib: LibItem[] = []
    let savedHist: string[] = []
    let savedFavs = DEFAULT_FAVS
    let savedDh: DhRow[] = []

    if (typeof localStorage !== 'undefined') {
      try {
        const rawLib = localStorage.getItem(STORAGE_KEY_LIB)
        if (rawLib) {
          const parsed = JSON.parse(rawLib)
          if (Array.isArray(parsed)) {
            savedLib = parsed.filter((item: LibItem) => !['l1', 'l2', 'l3'].includes(item?.id))
          }
        }
        const rawHist = localStorage.getItem(STORAGE_KEY_HIST)
        if (rawHist) {
          const parsed = JSON.parse(rawHist)
          if (Array.isArray(parsed)) {
            savedHist = parsed.filter((q: string) => !['lofi beats', 'timelapse 4k', 'movie trailers'].includes(q))
          }
        }
        const rawFavs = localStorage.getItem(STORAGE_KEY_FAVS)
        if (rawFavs) savedFavs = JSON.parse(rawFavs)
        const rawDh = localStorage.getItem(STORAGE_KEY_DH)
        if (rawDh) {
          const parsed = JSON.parse(rawDh)
          if (Array.isArray(parsed)) {
            savedDh = parsed.filter((item: DhRow) => !item?.title?.includes('Big Buck Bunny') && !item?.title?.includes('Elephants Dream'))
          }
        }
      } catch {}
    }

    this.state = {
      sc: {},
      scv: 0,
      dh: false,
      dhc: false,
      dhRows: savedDh,
      lf: 0,
      ld: null,
      dr: [],
      lib: savedLib,
      dp: [],
      dx: null,
      dm: false,
      dmc: false,
      cell: [],
      lm: false,
      lay: 'list',
      lq: '',
      hmenu: null,
      sel: false,
      selIds: [],
      selConf: false,
      stOpen: false,
      info: null,
      swm: false,
      pm: false,
      pmp: 0,
      cpriv: false,
      pv: 0,
      tmc: false,
      caOn: false,
      cax: 0,
      tm: false,
      tmp: 0,
      dw: false,
      dwp: 0,
      hb: 1,
      ci: 0,
      tsp: 0,
      tsph: '',
      sf: 0,
      pa: 0,
      pb: 0,
      nph: '',
      npp: 0,
      cl: null,
      cf: 0,
      pt: 0,
      nz: null,
      nzph: '',
      nzp: 0,
      nzf: 0,
      hist: savedHist,
      histClearedToast: false,
      hm: false,
      hmp: 0,
      hop: 0,
      screen: 'browse',
      sheet: false,
      fmt: 'v720',
      jobs: [],
      playing: '',
      playingMedia: null,
      seq: null,
      sp: 0,
      q: '',
      tabs: [{ id: 1, text: '', priv: false }],
      sw: false,
      swp: 0,
      swt: 0,
      adding: false,
      mp: 0,
      gp: 1,
      pick: 0,
      newId: '',
      fx: 0,
      rx: 0,
      scale: 1,
      vw: typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1194,
      vh: typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 1180,
      favs: savedFavs,
      detectedVideo: null,
      webviewSrc: '',
      webviewUrl: '',
      searchFocused: false,
      pullY: 0,
      isPulling: false,
      isRefreshing: false,
      refreshKey: 0,
      refreshedToast: false,
      draggingTabIdx: null,
      dragTabOffset: 0,
      stripW: { fav: 0, rec: 0 },
      barW: { home: 560, dock: 492 },
      mainH: 0,
    }
  }

  handleResize = () => {
    if (typeof window !== 'undefined') {
      this.setState(
        { scale: 1, vw: window.innerWidth, vh: window.innerHeight },
        this.syncBrowserPane,
      )
    }
  }

  handleMessage = (e: MessageEvent) => {
    const data = e.data
    if (data && (data.source === 'vd-browser' || data.source === 'vd-native')) {
      if (data.type === 'detect' && data.payload?.url) {
        const { url, title, thumbnail } = data.payload
        this.handleVideoDetected(url, title, thumbnail)
      } else if (data.type === 'select-video' && data.payload?.url) {
        const { url, title, thumbnail } = data.payload
        this.handleVideoDetected(url, title, thumbnail)
        this.setState({ sheet: true })
      } else if (data.type === 'search-query' && data.payload?.query) {
        this.executeSearch(data.payload.query)
      } else if (data.type === 'pullRefresh') {
        // Browsing page pulled down at its top — run the shared refresh flow.
        debugLog('pullRefresh -> reload')
        this.triggerRefresh()
      } else if (data.type === 'nav' && data.payload?.url) {
        this.setState({ webviewUrl: data.payload.url })
      } else if (data.type === 'rail' && data.payload?.item) {
        // Native nav-rail / FAB tap (the shell draws both above the page).
        const item = data.payload.item
        if (item === 'home') this.goHome()
        else if (item === 'down') this.setState({ screen: 'down' })
        else if (item === 'lib') this.setState({ screen: 'lib' })
        else if (item === 'download') this.setState((st) => ({ sheet: !st.sheet }))
      }
    }
  }

  /** Mirror the nav rail's visual state (screen + badges) to the native shell,
   *  which renders the rail above every WebView layer. */
  pushRailState = () => {
    if (!hasNativeShell()) return
    const s = this.state
    const dlActive = s.jobs.filter((r) => r.status === 'downloading').length
    const dlFailed = s.jobs.some((r) => r.status === 'failed')
    const libNew = s.lib.some((r) => r.isNew)
    const dlDot = !!s.detectedVideo
    const key = `${s.screen}|${dlActive}|${dlFailed ? 1 : 0}|${libNew ? 1 : 0}|${dlDot ? 1 : 0}`
    if (key === this.lastRailKey) return
    this.lastRailKey = key
    sendNativeAction('rail', { screen: s.screen, dlActive, dlFailed, libNew, dlDot })
  }

  tabTextPatch = (tabs: TabItem[], ci: number, text: string): TabItem[] =>
    tabs.length > 0
      ? tabs.map((tab, idx) => (idx === ci ? { ...tab, text } : tab))
      : [{ id: Date.now(), text }]

  executeSearch = (text: string) => {
    const query = (text || '').trim()
    if (!query) return
    // A running sequence (incl. the home sweep) never eats typed input — a
    // new commit simply aborts it and restarts (browser behavior: Enter is
    // never ignored).
    // The query commits now — a later blur must revert to THIS value, not to
    // whatever the box held when it was focused.
    this.qOrig = query
    debugLog(`executeSearch "${query}" | tabs=${this.state.tabs.length} ci=${this.state.ci} phase=${this.state.seq?.phase ?? 'none'} webviewSrc=${this.state.webviewSrc ? 'yes' : 'no'}`)

    const curTab = this.state.tabs[this.state.ci]
    if (curTab) {
      this.pushTabHistory(curTab.id, query)
    }

    const updatedTabs = this.tabTextPatch(this.state.tabs, this.state.ci, query)

    const nextHist = [query, ...this.state.hist.filter((h) => h !== query)].slice(0, 8)
    const seqPhase = this.state.seq?.phase
    const isAlreadyUp =
      seqPhase === 'done' ||
      (seqPhase === 'load' && !!this.state.seq?.keepUp) ||
      (!!this.state.webviewSrc && !this.state.seq)
    const initialPhase = isAlreadyUp ? 'load' : 'fade'

    const patch: Record<string, unknown> = {
      screen: 'browse',
      searchFocused: false,
      seq: { key: 'search:' + query, text: query, phase: initialPhase, t0: Date.now(), keepUp: isAlreadyUp || undefined },
      sp: 0,
      q: query,
      tabs: updatedTabs,
      hist: nextHist,
    }
    // Re-search from a live page skips `scan`, so resolve the target here —
    // the scan->load hook only runs on the full fade->scan->load path.
    let navTarget: string | null = null
    if (isAlreadyUp) {
      const target = resolveWebTarget(query)
      navTarget = target.src
      // The navigation is sent EXPLICITLY from the setState callback below;
      // componentDidUpdate's webviewSrc-change detection alone silently skips
      // a repeat query (same URL) or a stale webviewSrc (after in-page taps).
      this.suppressNav = true
      patch.webviewSrc = target.src
      patch.webviewUrl = target.url
      patch.tabs = updatedTabs.map((t, idx) =>
        idx === this.state.ci ? { ...t, url: target.src } : t,
      )
      if (curTab) this.liveShellTabs.add(curTab.id)
    }

    this.setState(patch as any, () => {
      this.saveStorage()
      this.handleVideoDetected(query)
      if (navTarget && hasNativeShell()) requestNavigation(navTarget)
    })
  }

  handleVideoDetected = async (url: string, title?: string, thumbnail?: string) => {
    try {
      const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`)
      if (res.ok) {
        const info = await res.json()
        const formats: FormatOption[] = (info.formats || []).map((f: any) => ({
          id: f.id,
          label: f.label,
          meta: f.kind === 'audio' ? 'Audio · M4A' : `${f.ext.toUpperCase()} · ${f.height || 720}p`,
        }))
        this.setState({
          detectedVideo: {
            url,
            title: info.title || title || 'Detected Video',
            thumbnail: info.thumbnail || thumbnail,
            durationSec: info.durationSec,
            formats,
          },
          fmt: formats[0]?.id || '',
        })
        return
      }
    } catch {}

    // Fallback if offline or direct link
    const isDirect = /\.(mp4|mov|webm|m4v|m3u8)(\?|$)/i.test(url)
    const directFormats: FormatOption[] = isDirect
      ? [{ id: 'orig', label: 'Original Stream', meta: 'Direct Stream' }]
      : []

    this.setState({
      detectedVideo: {
        url,
        title: title || (isDirect ? 'Direct Media' : ''),
        thumbnail,
        formats: directFormats,
      },
      fmt: directFormats[0]?.id || '',
    })
  }

  saveStorage = () => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_LIB, JSON.stringify(this.state.lib))
        localStorage.setItem(STORAGE_KEY_HIST, JSON.stringify(this.state.hist))
        localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(this.state.favs))
        localStorage.setItem(STORAGE_KEY_DH, JSON.stringify(this.state.dhRows))
      } catch {}
    }
  }

  /** True for exactly one componentDidUpdate after a tab switch / back-forward
   *  jump: the shell already shows the target page (its WebView stays alive),
   *  so the `webviewSrc` change must NOT be forwarded as a `navigate`. */
  suppressNav = false

  /** Tab ids that currently have a live browsing page open in the native
   *  shell. The per-tab url mirror can miss navState events; this flag is the
   *  fallback so switching back (or closing back) never re-navigates a page
   *  the shell still has alive. */
  liveShellTabs = new Set<number>()

  /** Push the web tab list (source of truth for order + ids) to the shell so
   *  its browsing-WebView mirror can't drift. Runs on mount and whenever the
   *  list or the active index changes. */
  pushTabSync = () => {
    if (!hasNativeShell()) return
    requestSyncTabs(
      this.state.tabs.map((t) => ({ id: String(t.id), url: t.url || '', title: t.text })),
      this.state.ci,
    )
  }

  clearHistTimeout: any = null

  clearRecentSearches = () => {
    if (this.clearHistTimeout) clearTimeout(this.clearHistTimeout)
    this.setState({
      hist: [],
      histClearedToast: true,
    }, () => {
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY_HIST, JSON.stringify([]))
        } catch {}
      }
    })
    this.clearHistTimeout = setTimeout(() => {
      this.setState({ histClearedToast: false })
    }, 2400)
  }

  pillDragIdx: number | null = null
  pillStartX = 0
  pillMoved = false

  handlePillPointerDown = (e: React.PointerEvent, idx: number) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    this.pillDragIdx = idx
    this.pillStartX = e.clientX
    this.pillMoved = false
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {}
  }

  handlePillPointerMove = (e: React.PointerEvent, idx: number) => {
    if (this.pillDragIdx !== idx) return
    const dx = e.clientX - this.pillStartX
    if (!this.pillMoved && Math.abs(dx) > 6) {
      this.pillMoved = true
      this.setState({ draggingTabIdx: idx, dragTabOffset: dx })
    } else if (this.pillMoved) {
      this.setState({ dragTabOffset: dx })
    }
  }

  handlePillPointerUp = (_e: React.PointerEvent, idx: number, pitch: number, totalTabs: number, defaultGo: () => void) => {
    if (this.pillDragIdx !== idx) return
    const wasMoved = this.pillMoved
    const offset = this.state.dragTabOffset
    this.pillDragIdx = null
    this.pillMoved = false

    if (wasMoved && Math.abs(offset) > 12) {
      const steps = Math.round(offset / (pitch || 1))
      const targetIdx = Math.max(0, Math.min(totalTabs - 1, idx + steps))
      this.setState({ draggingTabIdx: null, dragTabOffset: 0 })
      if (targetIdx !== idx) {
        this.reorderTabs(idx, targetIdx)
      }
    } else {
      this.setState({ draggingTabIdx: null, dragTabOffset: 0 })
      if (!wasMoved) {
        defaultGo()
      }
    }
  }

  reorderTabs = (fromIndex: number, toIndex: number) => {
    const { tabs, ci, cpriv, q } = this.state
    const all = tabs.length > 0 ? [...tabs] : [{ id: 1, text: q || '', priv: cpriv }]
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= all.length || toIndex >= all.length) {
      return
    }
    const activeTab = all[ci]
    const activeTabId = activeTab ? activeTab.id : null

    const [moved] = all.splice(fromIndex, 1)
    all.splice(toIndex, 0, moved)

    const nextCi = activeTabId !== null ? all.findIndex((t) => t.id === activeTabId) : 0
    this.setState({
      tabs: all,
      ci: nextCi >= 0 ? nextCi : 0,
    })
  }

  pullStartY = 0
  isPullGesture = false
  refreshTimer: any = null

  handlePullStart = (clientY: number) => {
    if (this.state.isRefreshing) return
    this.pullStartY = clientY
    this.isPullGesture = true
  }

  handlePullMove = (clientY: number) => {
    if (!this.isPullGesture || this.state.isRefreshing) return
    const delta = clientY - this.pullStartY
    if (delta > 0) {
      const pullY = Math.min(84, Math.round(Math.pow(delta, 0.85) * 1.5))
      this.setState({ pullY, isPulling: true })
    }
  }

  handlePullEnd = () => {
    if (!this.isPullGesture) return
    this.isPullGesture = false
    if (this.state.pullY >= 50) {
      this.triggerRefresh()
    } else {
      this.setState({ pullY: 0, isPulling: false })
    }
  }

  triggerRefresh = () => {
    const canReload = hasNativeShell() && !!this.state.webviewSrc
    if (this.state.isRefreshing) {
      // A repeat pull during the spinner window must still reload — the old
      // early return silently swallowed it (and the page's one-shot pull
      // latch then blocked every later pull until an unrelated reload).
      if (canReload) requestReload()
      return
    }
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    // Native shell: actually reload the browsing WebView — before this, only
    // the pure-web iframe remounted (via refreshKey below) and the real page
    // never reloaded. Called by the bar's refresh button AND the page's
    // pull-to-refresh gesture (relayed as `pullRefresh`).
    if (canReload) requestReload()
    this.setState({
      isRefreshing: true,
      pullY: 54,
      isPulling: false,
    })

    this.refreshTimer = setTimeout(() => {
      this.setState({
        refreshKey: (this.state.refreshKey || 0) + 1,
        refreshedToast: true,
      })
      if (this.state.webviewUrl || this.state.q) {
        this.handleVideoDetected(this.state.webviewUrl || this.state.q)
      }
      setTimeout(() => {
        this.setState({
          isRefreshing: false,
          pullY: 0,
          refreshedToast: false,
        })
      }, 450)
    }, 650)
  }

  componentDidMount() {
    this.handleResize()
    this.measureStrips()
    this.pushRailState()
    window.addEventListener('resize', this.handleResize)
    window.addEventListener('orientationchange', this.handleResize)
    window.addEventListener('message', this.handleMessage)

    // Download jobs progress ticker
    this.t = setInterval(() => {
      const js = this.state.jobs
      if (!js.some((j) => j.status === 'downloading')) return

      const updated = js.map((j) => {
        if (j.status !== 'downloading') return j
        const nextPct = Math.min(100, j.pct + 10)
        if (nextPct >= 100) {
          const finishedJob: JobItem = { ...j, pct: 100, status: 'done' }
          // Add to Library with real metadata
          const isFmt1080 = j.fmtLabel.includes('1080')
          const isFmt480 = j.fmtLabel.includes('480')
          const sizeStr = j.audio ? '9.4 MB' : isFmt1080 ? '185 MB' : isFmt480 ? '39 MB' : '84 MB'
          const mbNum = j.audio ? 9 : isFmt1080 ? 185 : isFmt480 ? 39 : 84
          const durSec = this.state.detectedVideo?.durationSec || 0
          const minutes = Math.floor(durSec / 60)
          const seconds = String(durSec % 60).padStart(2, '0')

          const newLibItem: LibItem = {
            id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: j.title,
            fmt: j.fmtLabel,
            size: sizeStr,
            when: 'Just now',
            dur: durSec > 0 ? `${minutes}:${seconds}` : 'Media',
            audio: !!j.audio,
            mb: mbNum,
            isNew: true,
            src: j.src || '',
          }
          const nextDh: DhRow = {
            title: j.title,
            fmt: j.fmtLabel,
            when: 'Just now',
            status: 'Completed',
            ink: '#3ecf8e',
          }
          setTimeout(() => {
            this.setState((prev) => ({
              lib: [newLibItem, ...prev.lib],
              dhRows: [nextDh, ...prev.dhRows],
            }), this.saveStorage)
          }, 200)
          return finishedJob
        }
        return { ...j, pct: nextPct }
      })
      this.setState({ jobs: updated })
    }, 500)

    this.unsubPageLoad = onPageLoad((e) => {
      if (e.tabIndex !== this.state.ci || (e.state !== 'end' && e.state !== 'error')) return
      if (!this.loadStartedAt) return
      this.pageLoaded = true
      const seq = this.state.seq
      if (seq?.phase === 'load' && Date.now() - this.loadStartedAt >= 350 && this.state.sp >= 1) {
        this.setState({ seq: { ...seq, phase: 'done' }, sp: 0 })
      }
    })

    this.unsubNav = onNavState((e) => {
      // Per-tab page URL (source of truth for tab.url) + active-tab chrome.
      const tabs = this.state.tabs.map((t, idx) =>
        idx === e.tabIndex ? { ...t, url: e.url || t.url } : t,
      )
      if (e.tabIndex !== this.state.ci) {
        this.setState({ tabs })
        return
      }
      this.setState({
        tabs,
        canGoBackNative: e.canGoBack,
        canGoForwardNative: e.canGoForward,
        webviewUrl: e.url || this.state.webviewUrl,
      })
    })

    this.tick = setInterval(() => {
      const s = this.state
      const up: Partial<AppState> = {}
      // Time-based progression: a heavy page (YouTube) can starve this
      // WebView's main thread for hundreds of ms per tick — fixed +0.0x
      // increments then crawl and the rdown wipe parks the pane mid-screen
      // ("under the center"). Advance by elapsed time so the sweep keeps
      // wall-clock pace no matter the jank (dt clamped to 3 ticks).
      const now = Date.now()
      const dt = Math.min(90, now - (this.lastTickAt || now))
      this.lastTickAt = now
      if (s.adding && s.mp < 1) up.mp = Math.min(1, s.mp + 0.14)
      if (s.sw && s.swp < 1) up.swp = Math.min(1, s.swp + 0.14)
      if (s.sw) up.swt = Math.min(6000, s.swt + 30)
      else if (s.swp === 0 && s.swt) up.swt = 0
      if (!s.sw && s.swp > 0) up.swp = Math.max(0, s.swp - 0.14)
      if (!s.adding && s.mp > 0) {
        up.mp = Math.max(0, s.mp - 0.12)
        if (up.mp === 0 && this.pending) {
          const fw = s.favs.length * 120
          const o = this.norm(s.fx, fw)
          const idx = Math.floor(((((234 - o) % fw) + fw) % fw) / 120) % s.favs.length
          const nextFavs = [...s.favs.slice(0, idx), this.pending, ...s.favs.slice(idx)]
          up.favs = nextFavs
          up.newId = this.pending.label
          up.gp = 0
          up.fx = o
          this.pending = null
          this.saveStorage()
        }
      }
      if (s.gp < 1) {
        up.gp = Math.min(1, s.gp + 0.05)
        if (up.gp === 1) {
          this.hold = false
          this.act.fx = 0
        }
      }
      if (s.seq) {
        if (s.seq.phase === 'fade') {
          const p = Math.min(1, s.sp + dt / 667)
          up.sp = p
          if (p === 1) {
            // Resolve the Web target at fade->scan (not scan->load) so the
            // native pane is placed — hidden — at scan start and the page
            // loads during the bar stretch, not after it.
            const txt = s.seq.text.trim()
            const target = resolveWebTarget(txt)
            up.webviewSrc = target.src
            up.webviewUrl = target.url
            // Stamp the resolved URL onto the active tab so switching away
            // and back reuses it (the shell keeps the page alive) instead of
            // re-running the search.
            up.tabs = s.tabs.map((t, idx) => (idx === s.ci ? { ...t, url: target.src } : t))
            if (!s.cpriv) {
              up.hist = [txt, ...s.hist.filter((h) => h !== txt)].slice(0, 8)
              setTimeout(this.saveStorage, 100)
            }
            const curTab = s.tabs[s.ci]
            if (curTab) {
              this.liveShellTabs.add(curTab.id)
              this.pushTabHistory(curTab.id, txt)
            }
            this.handleVideoDetected(txt)
            this.pageLoaded = false
            this.loadStartedAt = Date.now()
            up.seq = { ...s.seq, phase: 'scan' }
            up.sp = 0
          }
        } else if (s.seq.phase === 'scan') {
          const p = Math.min(1, s.sp + dt / (s.seq.skip ? 750 : 1200))
          up.sp = p
          if (p === 1) {
            up.seq = { ...s.seq, phase: s.seq.skip ? 'done' : 'load', t0: Date.now() }
            up.sp = 0
          }
        } else if (s.seq.phase === 'load') {
          const p = Math.min(1, s.sp + dt / 750)
          up.sp = p
          // Do not reveal a blank pane: wait for native pageLoad.end after a
          // short minimum, with a bounded fallback for slow or silent pages.
          const elapsed = Date.now() - this.loadStartedAt
          const ready = this.pageLoaded && elapsed >= 350
          const timedOut = elapsed >= 4000
          if ((ready || timedOut) && p >= 1) {
            up.seq = { ...s.seq, phase: 'done' }
            up.sp = 0
          }
        } else if (s.seq.phase === 'done' && s.sp < 1) {
          up.sp = Math.min(1, s.sp + dt / 429)
        } else if (s.seq.phase === 'rdown') {
          const p = Math.min(1, s.sp + dt / 750)
          up.sp = p
          if (p === 1) {
            up.seq = { ...s.seq, phase: 'rup' }
            up.sp = 0
            // Mockup clears the query when the bar finishes its dive; the
            // native pane drops with the results container (syncBrowserPane).
            up.q = ''
            up.webviewSrc = ''
            up.webviewUrl = ''
            up.detectedVideo = null
            // Tab text is kept (mockup parity) — the strip stays on home with
            // the query in the card; only the history cursor resets.
            const curTab = s.tabs[s.ci]
            if (curTab) {
              const th = this.tabHistories[curTab.id]
              this.tabHistories[curTab.id] = { stack: th ? th.stack : [], index: -1 }
            }
          }
        } else if (s.seq.phase === 'rup') {
          const p = Math.min(1, s.sp + dt / 667)
          up.sp = p
          if (p === 1) {
            up.seq = { ...s.seq, phase: 'rfade' }
            up.sp = 0
          }
        } else if (s.seq.phase === 'rfade') {
          const p = Math.min(1, s.sp + dt / 375)
          up.sp = p
          if (p === 1) {
            up.seq = null
            up.sp = 0
            up.q = ''
          }
        }
      }
      const idle = (k: string) => !this.dr[k] && Date.now() - (this.act[k] || 0) > 1800
      const favBusy = this.hold || s.adding || s.mp > 0 || s.gp < 1
      if (s.screen === 'browse') {
        if (idle('fx') && !favBusy && !s.seq && s.favs.length * 120 > s.stripW.fav) up.fx = s.fx - 0.9
        if (idle('rx') && !s.seq && s.hist.length * 120 > s.stripW.rec) up.rx = s.rx + 0.75
      }
      if (s.nph) {
        if (s.nph === 'slide') {
          const p = Math.min(1, s.npp + 0.085)
          up.npp = p
          if (p === 1) {
            up.nph = 'hold'
            up.npp = 0
          }
        } else if (s.nph === 'hold') {
          const p = Math.min(1, s.npp + 0.08)
          up.npp = p
          if (p === 1) {
            up.nph = 'out'
            up.npp = 0
            const f = this.afterNew
            this.afterNew = null
            if (f) f()
          }
        } else if (s.nph === 'out') {
          const p = Math.min(1, s.npp + 0.1)
          up.npp = p
          if (p === 1) {
            up.nph = ''
            up.npp = 0
          }
        }
      }
      {
        const ap = (v: number, t: number, u: number, d: number) =>
          t > v ? Math.min(t, v + u) : Math.max(t, v - d)
        const strip = s.tabs.some((t) => !!t.text) && s.screen === 'browse'
        const topT = strip && (!s.seq || s.seq.phase === 'rfade') ? 1 : 0
        const underT = strip && s.seq && s.seq.phase === 'done' ? 1 : 0
        const npa = ap(s.pa, topT, 0.07, 0.14)
        const npb = ap(s.pb, underT, 0.035, 0.12)
        if (npa !== s.pa) up.pa = npa
        if (npb !== s.pb) up.pb = npb
        if (this.lastN !== undefined && s.tabs.length > this.lastN) this.sfGo = true
        this.lastN = s.tabs.length
        if (this.sfGo && !this.dr.sf) {
          const nf = s.sf + (1 - s.sf) * 0.15
          if (1 - nf < 0.004) {
            up.sf = 1
            this.sfGo = false
          } else up.sf = nf
        }
      }
      if (s.tsph) {
        if (s.tsph === 'out') {
          const v = Math.min(1, s.tsp + 0.1)
          up.tsp = v
          if (v === 1) {
            up.tsph = 'in'
            const f = this.afterTs
            this.afterTs = null
            if (f) f()
          }
        } else {
          const v = Math.max(0, s.tsp - 0.08)
          up.tsp = v
          if (v === 0) up.tsph = ''
        }
      }
      if (s.caOn) {
        const v = Math.min(1, s.cax + 0.08)
        up.cax = v
        if (v >= 1) {
          up.caOn = false
          up.cax = 0
          up.tabs = [{ id: Date.now(), text: '', priv: false }]
          up.ci = 0
          up.cpriv = false
          this.pos = {}
          this.pp = []
          this.liveShellTabs.clear()
        }
      }
      if (s.cl) {
        const p = Math.min(1, s.cf + 0.09)
        up.cf = p
        if (p >= 1) {
          const f = this.afterClose
          this.afterClose = null
          up.cl = null
          up.cf = 0
          if (f) f()
        }
      }
      {
        const vis = s.sw || s.swp > 0
        let moving = false
        this.ids(s).forEach((id, i) => {
          const [tx, ty] = this.xy(i)
          const q = this.pos[id]
          if (!q) {
            this.pos[id] = { x: tx, y: ty }
            return
          }
          const dx = tx - q.x
          const dy = ty - q.y
          if (vis && Math.abs(dx) + Math.abs(dy) > 0.5) {
            q.x += dx * 0.2
            q.y += dy * 0.2
            moving = true
          } else {
            q.x = tx
            q.y = ty
          }
        })
        if (moving) up.pt = Date.now()
      }
      if (s.nz) {
        if (s.nzph === 'zoom') {
          const p = Math.min(1, s.nzp + 0.045)
          up.nzp = p
          if (p === 1) {
            up.nzph = 'fade'
            up.sw = false
            Object.assign(up, s.nz.base)
          }
        } else if (s.nzph === 'fade') {
          const f = Math.min(1, s.nzf + 0.02)
          up.nzf = f
          if (f === 1) {
            up.nz = null
            up.nzph = ''
            up.nzp = 0
            up.nzf = 0
          }
        }
      }
      const hv = s.screen === 'browse' && !s.seq && !s.sw && !s.adding
      if (!hv && s.hm) up.hm = false
      if (s.tm && s.sw) up.tm = false
      if (!s.tm && s.tmc) up.tmc = false
      if (!s.sw && s.pm) up.pm = false
      if (s.pm && s.pmp < 1) up.pmp = Math.min(1, s.pmp + 0.14)
      else if (!s.pm && s.pmp > 0) up.pmp = Math.max(0, s.pmp - 0.14)
      if (s.tm && s.tmp < 1) up.tmp = Math.min(1, s.tmp + 0.14)
      else if (!s.tm && s.tmp > 0) up.tmp = Math.max(0, s.tmp - 0.14)
      if (s.hm && s.hmp < 1) up.hmp = Math.min(1, s.hmp + 0.14)
      else if (!s.hm && s.hmp > 0) up.hmp = Math.max(0, s.hmp - 0.14)
      {
        // Mockup: house icon stays through rdown/rup, morphs back to the
        // hamburger during rfade (hT only flips on home / rfade).
        const hT = s.screen === 'browse' && !s.webviewSrc && (!s.seq || s.seq.phase === 'rfade') ? 1 : 0
        if (s.hb !== hT) up.hb = hT > s.hb ? Math.min(1, s.hb + 0.1) : Math.max(0, s.hb - 0.1)
        const pT = s.cpriv ? 1 : 0
        if (s.pv !== pT) up.pv = pT > s.pv ? Math.min(1, s.pv + 0.08) : Math.max(0, s.pv - 0.08)
        if (s.dw && s.dwp < 1) up.dwp = Math.min(1, s.dwp + 0.12)
        else if (!s.dw && s.dwp > 0) up.dwp = Math.max(0, s.dwp - 0.12)
      }
      if (Object.keys(up).length) this.setState(up as any)
    }, 30)

    // Align the shell's tab mirror (ids, order, active) before first paint.
    this.pushTabSync()
  }

  componentDidUpdate(_prevProps: {}, prevState: AppState) {
    const prevPhase = prevState.seq?.phase ?? 'none'
    const phase = this.state.seq?.phase ?? 'none'
    if (prevPhase !== phase) {
      debugLog(`seq ${prevPhase} -> ${phase} | tabs=${this.state.tabs.length} ci=${this.state.ci} src=${this.state.webviewSrc ? 'yes' : 'no'}`)
    }
    if (prevState.tabs.length !== this.state.tabs.length) {
      debugLog(`tabs ${prevState.tabs.length} -> ${this.state.tabs.length} ci=${this.state.ci}`)
    }
    this.syncBrowserPane()
    this.measureStrips()
    if (prevState.tabs !== this.state.tabs || prevState.ci !== this.state.ci) {
      this.pushTabSync()
    }
    if (
      prevState.screen !== this.state.screen ||
      prevState.jobs !== this.state.jobs ||
      prevState.lib !== this.state.lib ||
      prevState.detectedVideo !== this.state.detectedVideo
    ) {
      this.pushRailState()
    }
    if (this.suppressNav) {
      // Consumed unconditionally: even if webviewSrc ended up unchanged
      // (two tabs on the same URL), the flag must not leak into the next
      // genuine navigation.
      this.suppressNav = false
    } else if (hasNativeShell() && this.state.webviewSrc && this.state.webviewSrc !== prevState.webviewSrc) {
      requestNavigation(this.state.webviewSrc)
    }
  }

  componentWillUnmount() {
    if (this.clearHistTimeout) clearTimeout(this.clearHistTimeout)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (this.sheetSyncTimer) clearTimeout(this.sheetSyncTimer)
    if (this.unsubNav) this.unsubNav()
    if (this.unsubPageLoad) this.unsubPageLoad()
    clearInterval(this.t)
    clearInterval(this.tick)
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('orientationchange', this.handleResize)
    window.removeEventListener('message', this.handleMessage)
  }

  geo(n: number, mn: number, mx: number, gap: number, pmin: number) {
    // Strip-relative constants from the mockup (140px side margins, 24px
    // edge-mask inset): cap = vw - 280 - 48. At the mockup's 820 this is
    // exactly 492 and base 164 — pixel-identical there, viewport-correct here.
    const vw = this.state.vw || 820
    const cap = Math.max(120, vw - 328)
    let w: number, pitch: number
    if (n * mn + gap * (n - 1) <= cap) {
      w = Math.min(mx, Math.floor((cap - gap * (n - 1)) / n))
      pitch = w + gap
    } else {
      w = mn
      pitch = Math.max(pmin, Math.floor((cap - mn) / (n - 1)))
    }
    const content = (n - 1) * pitch + w
    const over = content > cap
    return { w, pitch, content, over, range: over ? content - cap : 0, base: over ? 164 : (vw - content) / 2 }
  }

  ids(s: AppState): string[] {
    const all = s.tabs.length > 0 ? s.tabs : [{ id: 1, text: '', priv: s.cpriv }]
    const l = all.filter((t) => !!t.priv === s.swm)
    return [
      ...l.map((t) => String(t.id)),
      ...(all.length < 10 ? ['new'] : []),
    ]
  }

  /** Tab-switcher grid scale: mockup metrics (736 grid, 360 cards, 480
   *  previews, 376x552 pitch) shrunk to fit the live viewport, both axes. */
  swScale(): number {
    const vw = this.state.vw || 1194
    const vh = this.state.vh || 1180
    const availW = Math.max(360, vw - 56)
    let k = Math.min(1, availW / 736)
    const availH = Math.max(320, vh - 200)
    const needH = 552 * 1.25
    if (needH > availH) k = Math.min(k, availH / needH)
    return Math.max(0.55, k)
  }

  xy(i: number): [number, number] {
    const k = this.swScale()
    return [(i % 2) * Math.round(376 * k), Math.floor(i / 2) * Math.round(552 * k)]
  }

  norm(v: number, w: number): number {
    return Math.round((((v % w) + w) % w) - w)
  }

  startDownload = () => {
    const s = this.state
    const video = s.detectedVideo
    const f = video?.formats.find((x) => x.id === s.fmt) || video?.formats[0] || {
      id: 'v720',
      label: '720p HD MP4',
      meta: 'Video · H.264',
    }

    const title = video?.title || 'Downloaded Video'
    const isAudio = f.id.startsWith('a')
    const newJob: JobItem = {
      id: Date.now(),
      title,
      fmtLabel: f.label,
      pct: 0,
      status: 'downloading',
      src: video?.url || '',
      audio: isAudio,
    }

    this.setState({
      sheet: false,
      jobs: [newJob, ...s.jobs],
    })
  }

  render() {
    const s = this.state
    const active = s.jobs.filter((j) => j.status === 'downloading')
    const first = active[0]

    const thumb = (k: string) => {
      const m = s.sc[k]
      if (!m || m.h <= m.c + 1) return { display: 'none' }
      const th = Math.max(44, Math.round((m.c * m.c) / m.h))
      const top = 4 + Math.round((m.t / (m.h - m.c)) * (m.c - th - 8))
      return {
        position: 'absolute' as const,
        right: 4,
        top,
        width: 5,
        height: th,
        borderRadius: 3,
        background: 'rgba(232,234,240,.6)',
        pointerEvents: 'none' as const,
        transition: 'opacity .3s',
        opacity: Date.now() - m.at < 900 ? 1 : 0,
      }
    }

    const onSc = (k: string) => (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      this.setState({
        sc: {
          ...this.state.sc,
          [k]: { t: el.scrollTop, h: el.scrollHeight, c: el.clientHeight, at: Date.now() },
        },
      })
      clearTimeout(this.scT)
      this.scT = setTimeout(() => this.setState({ scv: Date.now() }), 1000)
    }

    const fillOf = (pct: number, c: string, extra?: string) =>
      `display:block;height:6px;border-radius:3px;background:${c};width:${pct}%${extra || ''}`
    const ringOf = (pct: number, c: string) =>
      `flex:none;padding:3px;border-radius:16px;background:conic-gradient(${c} ${pct}%,#2b3140 0)`

    const dlMk = (o: any) => ({
      audio: false,
      isErr: false,
      showBar: true,
      err: '',
      meta: '',
      subInk: '#9aa3b2',
      pct: 0,
      color: '#3ecf8e',
      waiting: false,
      remux: false,
      detail: '',
      ...o,
    })

    const dlRows = s.jobs
      .filter((j) => !s.dr.includes(j.title))
      .map((j, i) => {
        const isPaused = s.dp.includes(j.title) || j.status === 'paused'
        const isFailed = j.status === 'failed'
        const color = isFailed ? '#ff7a9c' : isPaused ? '#6b7385' : '#3ecf8e'
        const subInk = isFailed ? '#ff7a9c' : isPaused ? '#9aa3b2' : '#3ecf8e'
        const sub = isFailed
          ? 'Failed · ' + j.fmtLabel
          : isPaused
            ? 'Paused · ' + j.fmtLabel
            : 'Downloading · ' + j.fmtLabel
        const meta = isPaused
          ? 'Paused · tap resume to continue'
          : `${j.pct}% · ${j.audio ? '2.4 MB/s' : '5.8 MB/s'}`

        return dlMk({
          title: j.title,
          sub,
          subInk,
          meta,
          pct: j.pct,
          color,
          audio: !!j.audio,
          isErr: isFailed,
          paused: isPaused,
          notPaused: !isPaused,
          canPause: !isFailed,
          pauseLbl: isPaused ? 'Resume' : 'Pause',
          bar: fillOf(j.pct, color),
          ringBg: ringOf(isFailed ? 100 : j.pct, color),
          isMedia: !j.audio,
          anim: `animation:vdpop .42s cubic-bezier(.2,.8,.2,1) both;animation-delay:${i * 40}ms`,
          togglePause: () => {
            this.setState((prev) => ({
              dp: isPaused ? prev.dp.filter((x) => x !== j.title) : [...prev.dp, j.title],
              jobs: prev.jobs.map((job) =>
                job.id === j.id ? { ...job, status: isPaused ? 'downloading' : 'paused' } : job,
              ),
            }))
          },
          toggleEx: () => this.setState((prev) => ({ dx: prev.dx === j.title ? null : j.title })),
          remove: () => {
            this.setState((prev) => ({
              jobs: prev.jobs.filter((x) => x.id !== j.id),
              dr: [...prev.dr, j.title],
            }))
          },
        })
      })

    const dlActive = s.jobs.filter((r) => r.status === 'downloading').length
    const dlFailed = s.jobs.some((r) => r.status === 'failed')

    const cards = s.lay === 'cards'
    const libAll: LibItem[] = s.lib
    const mbTotal = libAll.reduce((a, r) => a + r.mb, 0)
    const qs = (s.lq || '').trim().toLowerCase()
    const libFiltered = libAll.filter(
      (r) =>
        (s.lf === 0 || (s.lf === 1 ? !r.audio : r.audio)) &&
        (!qs || r.title.toLowerCase().includes(qs)),
    )

    const pickToggle = (id: string) =>
      this.setState({
        selIds: s.selIds.includes(id) ? s.selIds.filter((x) => x !== id) : [...s.selIds, id],
      })

    const libRows = libFiltered.map((r, i) => {
      const picked = s.selIds.includes(r.id)
      return {
        ...r,
        sub: r.missing ? 'File missing' : r.fmt + ' · ' + r.size + ' · ' + r.when,
        subInk: r.missing ? '#ff7a9c' : '#9aa3b2',
        notAudio: !r.audio,
        hasDur: !!r.dur && !r.missing,
        showNew: !!r.isNew && !r.missing,
        showProg: !!r.prog,
        progSt: 'height:3px;border-radius:2px;background:#7c5cff;width:' + (r.prog || 0) + '%',
        showPriv: !!r.priv,
        rowSt:
          'position:relative;z-index:' +
          (s.hmenu === r.id ? 9 : 0) +
          ';opacity:' +
          (r.missing ? 0.55 : 1) +
          ';animation:vdpop .42s cubic-bezier(.2,.8,.2,1) both;animation-delay:' +
          Math.min(i, 12) * 40 +
          'ms',
        isCard: cards,
        isList: !cards,
        showSub: !!r.missing,
        cardSt:
          (cards
            ? 'position:relative;height:210px;border-radius:22px;overflow:hidden;background:linear-gradient(135deg,#3a3560,#171826)'
            : 'position:relative;display:flex;gap:14px;align-items:center;padding:10px 10px 10px 10px;border-radius:20px;background:#14161d') +
          ';box-shadow:' +
          (picked
            ? 'inset 0 0 0 2px #7c5cff'
            : cards
              ? '0 10px 28px rgba(0,0,0,.35)'
              : 'inset 0 0 0 1px rgba(255,255,255,.04)') +
          ';transition:box-shadow .25s ease',
        mOpen: () => this.setState({ hmenu: r.id }),
        showPlay: !s.sel && !r.missing,
        showActs: !s.sel,
        selOn: s.sel,
        picked,
        notPicked: !picked,
        conf: s.ld === r.id,
        menuOn: s.hmenu === r.id,
        down: () => {
          this.hold = false
          clearTimeout(this.ht3)
          this.ht3 = setTimeout(() => {
            this.hold = true
            this.setState({ hmenu: r.id })
          }, 520)
        },
        up: () => clearTimeout(this.ht3),
        tap: () => {
          if (this.hold) {
            this.hold = false
            return
          }
          if (s.sel) {
            pickToggle(r.id)
            return
          }
          if (!r.missing) {
            this.setState({
              playing: r.title + ' · ' + r.fmt,
              playingMedia: { url: r.src, title: r.title, audio: r.audio },
            })
          }
        },
        play: () => {
          this.setState({
            playing: r.title + ' · ' + r.fmt,
            playingMedia: { url: r.src, title: r.title, audio: r.audio },
          })
        },
        share: () => {
          if (typeof navigator !== 'undefined' && navigator.share) {
            navigator.share({ title: r.title, url: r.src }).catch(() => {})
          }
        },
        ask: () => this.setState({ ld: r.id }),
        no: () => this.setState({ ld: null }),
        yes: () => {
          const nextLib = s.lib.filter((x) => x.id !== r.id)
          this.setState({ lib: nextLib, ld: null }, this.saveStorage)
        },
        mInfo: () => this.setState({ info: r.id, hmenu: null }),
        mSel: () => this.setState({ sel: true, selIds: [r.id], hmenu: null }),
        mDel: () => this.setState({ ld: r.id, hmenu: null }),
        mPlay: () => {
          this.setState({
            playing: r.title + ' · ' + r.fmt,
            playingMedia: { url: r.src, title: r.title, audio: r.audio },
            hmenu: null,
          })
        },
        mShare: () => this.setState({ hmenu: null }),
      }
    })

    const infoItem = libAll.find((r) => r.id === s.info) || null
    const vMb = libAll.filter((r) => !r.audio).reduce((a, r) => a + r.mb, 0)
    const aMb = libAll.filter((r) => r.audio).reduce((a, r) => a + r.mb, 0)
    const fMb = 42 * 1024
    const tMb = vMb + aMb + fMb
    const fmtMb = (m: number) => (m >= 1024 ? (m / 1024).toFixed(1) + ' GB' : m + ' MB')
    const largest = [...libAll]
      .sort((a, b) => b.mb - a.mb)
      .slice(0, 5)
      .map((r) => ({ title: r.title, size: r.size }))
    const selCount = s.selIds.length

    const chip = (on: boolean) => ({
      minHeight: 44,
      padding: '0 20px',
      borderRadius: 22,
      fontSize: 16,
      fontWeight: 600,
      transition: 'background .25s ease,color .25s ease',
      background: on ? '#2d2a55' : 'rgba(255,255,255,.05)',
      color: on ? '#d7ccff' : '#9aa3b2',
    })

    const navStyle = (on: boolean) => ({
      position: 'relative' as const,
      width: 56,
      height: 56,
      borderRadius: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: on ? '#d7ccff' : '#9aa3b2',
      background: on ? '#3a2f78' : 'none',
      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
      transition: 'background .25s ease,color .25s ease',
    })

    const fmts: FormatOption[] = s.detectedVideo?.formats?.length
      ? s.detectedVideo.formats
      : []

    const rawRecents = s.hist
    const clip = (t: string) => {
      const w = t.trim().split(/\s+/)
      let o = w.slice(0, 2).join(' ')
      if (o.length > 14) o = o.slice(0, 14).trim()
      return o !== t.trim() ? o + '…' : o
    }

    const fw = Math.max(120, s.favs.length * 120)
    const rw = Math.max(120, rawRecents.length * 120)
    const favOver = fw > s.stripW.fav
    const recOver = rw > s.stripW.rec
    const norm = (v: number, w: number) => (w > 0 ? Math.round((((v % w) + w) % w) - w) : 0)

    const mk = (key: 'fx' | 'rx') => ({
      onPointerDown: (e: React.PointerEvent) => {
        this.dr[key] = true
        this.mv[key] = 0
        this.lxs[key] = e.clientX
        this.act[key] = Date.now()
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!this.dr[key]) return
        const dx = e.clientX - this.lxs[key]
        this.lxs[key] = e.clientX
        this.act[key] = Date.now()
        this.mv[key] = (this.mv[key] || 0) + Math.abs(dx)
        if (this.mv[key] > 6 && !this.cap[key]) {
          this.cap[key] = true
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } catch {}
        }
        this.setState({ [key]: this.state[key] + dx } as any)
      },
      onPointerUp: () => {
        if (this.dr[key]) {
          this.dr[key] = false
          this.act[key] = Date.now()
          if (this.cap) this.cap[key] = false
        }
      },
      onWheel: (e: React.WheelEvent) => {
        this.act[key] = Date.now()
        this.setState({ [key]: this.state[key] - (e.deltaX || 0) } as any)
      },
    })

    const fm = mk('fx')
    const rm = mk('rx')

    const PALETTE = [
      { name: 'Purple', bg: '#2d2a55', ink: '#b7a6ff' },
      { name: 'Green', bg: '#17382c', ink: '#3ecf8e' },
      { name: 'Amber', bg: '#3d2f12', ink: '#f2b84b' },
      { name: 'Rose', bg: '#3d1a26', ink: '#ff7a9c' },
    ]

    const ez = (x: number) => 1 - Math.pow(1 - x, 3)
    const sq = s.seq
    const ph = sq ? sq.phase : ''
    const mine = (key: string) =>
      sq && sq.key === key ? (ph === 'fade' ? 1 - s.sp : ph === 'rfade' ? s.sp : 0) : 1
    const start = (key: string, text: string, row: string) => () => {
      if (s.seq || (this.mv[row] || 0) > 6) return
      debugLog(`start "${text}" | tabs=${s.tabs.length} ci=${s.ci}`)
      this.setState({ seq: { key, text, phase: 'fade' }, sp: 0, q: text, tabs: this.tabTextPatch(s.tabs, s.ci, text) })
    }
    const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
    // Reverse-sweep geometry (mockup barY, scaled to our measured content
    // height; mockup main is 1180 tall so its 512/520 become these):
    //   rdown: dock (-dockDelta) -> home (0) -> dive below it (+diveEnd)
    //   rup:   dive end -> home;  rfade: parked at home
    const mainH = s.mainH || 1180
    const dockDelta = mainH / 2 - 78
    const diveEnd = mainH / 2 - 70
    const rY =
      ph === 'rdown'
        ? -dockDelta + (dockDelta + diveEnd) * eio(s.sp)
        : ph === 'rup'
          ? diveEnd * (1 - eio(s.sp))
          : ph === 'rfade'
            ? 0
            : null
    const barUpP =
      ph === 'scan'
        ? eio(s.sp)
        : ph === 'load' || ph === 'done'
          ? 1
          : rY !== null
            ? Math.max(0, Math.min(1, -rY / dockDelta))
            : (s.webviewSrc && ph !== 'rfade')
              ? 1
              : 0
    const barWp = barUpP
    // Below-home overshoot rides on top of the top/left formula (0 in all
    // forward phases — the banned positioning stays untouched).
    const barShiftY = rY !== null && rY > 0 ? Math.round(rY) : 0
    const clipBv =
      ph === 'scan'
        ? Math.max(0, Math.round(512 * barUpP - 22))
        : ph === 'load' || ph === 'done' || ph === 'rdown' || ph === 'rup'
          ? 9999
          : 0

    const favView = s.favs.map((f) => {
      const g = f.label === s.newId && s.gp < 1 ? ez(s.gp) : 1
      return {
        ...f,
        w: Math.round(120 * g),
        o: g * mine('fav:' + f.label),
        open: start('fav:' + f.label, f.url || f.label, 'fx'),
      }
    })

    const P = 1074.5
    const tt = sq && sq.t0 ? (Date.now() - sq.t0) / 1000 : 0
    const head = (tt * 0.8 * P) % P
    const kk = 1 + 0.5 * Math.sin(tt * 5.2)
    const rr = [60, 130, 220, 340, 480].map((l, i) => {
      const len = Math.min(P - 10, l * kk)
      return {
        da: len.toFixed(1) + ' ' + (P - len).toFixed(1),
        off: ((((len - head) % P) + P) % P).toFixed(1),
        op: [1, 0.8, 0.55, 0.35, 0.2][i],
      }
    })
    const laser =
      ph === 'fade'
        ? s.sp
        : ph === 'scan' || ph === 'load' || ph === 'rdown' || ph === 'rup'
          ? 1
          : ph === 'done' || ph === 'rfade'
            ? 1 - s.sp
            : 0
    const runner = ph === 'load' || ph === 'done'
    const runOp = (ph === 'load' ? 1 : ph === 'done' ? 1 - s.sp : 0) * (sq && sq.skip ? 0 : 1)
    const loading = ph === 'load'
    const status = sq ? 'Looking up ' + sq.text.slice(0, 40) + '…' : ''
    const isReverse = ph === 'rdown' || ph === 'rup' || ph === 'rfade'
    const isBarUp = Boolean(
      !isReverse &&
        (barUpP > 0.05 ||
          (sq && (ph === 'scan' || ph === 'load' || ph === 'done')) ||
          s.webviewSrc),
    )

    const activeDomain = getDisplayDomain(s.webviewUrl || (sq ? sq.text : s.q))

    let qText = s.q
    if (s.searchFocused) {
      qText = s.q
    } else if (isBarUp) {
      qText = activeDomain
    } else if (sq && ph === 'fade') {
      qText = sq.text.slice(0, Math.ceil(s.sp * sq.text.length))
    }
    const qAlpha = (ph === 'fade' ? 0.3 + 0.7 * s.sp : 1) * (1 - s.tsp)
    // Clear (X) button: only when the box holds text — focused shows s.q,
    // unfocused home shows the query; on a page (bar up, unfocused) it's
    // hidden because the refresh button lives there instead.
    const xOn = Boolean(s.searchFocused ? s.q : (isBarUp ? '' : s.q))
    const isHomeNow = s.screen === 'browse' && !s.webviewSrc && (!s.seq || s.seq.phase === 'rfade')
    const resTop = s.tabs.length ? 164 : 140
    // Mockup: inset(resClip) follows the bar's bottom edge as it sweeps down
    // over the results (560 + barY + 60 - resTop with mainH 1180).
    const resClip =
      ph === 'rdown' && rY !== null ? Math.max(0, Math.round(mainH / 2 + 30 + rY - resTop)) : 0

    const curTab = s.tabs[s.ci]
    const curHist = curTab ? this.tabHistories[curTab.id] : undefined
    const canGoForward = Boolean(
      (curHist && curHist.index < curHist.stack.length - 1) ||
        (!isHomeNow && hasNativeShell() && s.canGoForwardNative),
    )
    const canGoBack = Boolean(
      s.screen !== 'browse' || !isHomeNow || (curHist && curHist.index > 0),
    )

    const showResults = Boolean(
      s.screen === 'browse' &&
      Boolean(s.webviewSrc) &&
      (!s.seq ||
        ph === 'load' ||
        ph === 'done' ||
        // Native shell only: mount the slot during `scan` too so the hidden
        // pane can be placed while the bar stretches. Pure web keeps the
        // mockup timing (results appear at `load`).
        (ph === 'scan' && hasNativeShell()) ||
        (ph === 'rdown' && (1 - s.sp) > 0.01))
    )
    const resOp = (ph === 'rdown' ? 1 : s.sp) * (1 - s.tsp)
    // Under the native shell the results container is a transparent placeholder
    // (real content is the native WebView above it). Skip its slide-in — the
    // moving transform drags browserSlotRef's measured rect 1px/tick and makes
    // the native pane jitter. Keep it for the pure-web demo.
    const resY = ph === 'rdown' || hasNativeShell() ? 0 : Math.round((1 - s.sp) * 16)
    const resTitle = sq ? sq.text : s.q || 'Web Search'

    const pageUp = !!sq && (ph === 'load' || ph === 'done')
    const curText = pageUp ? sq.text : ''
    const restore = (text: string, liveUrl?: string): Partial<AppState> => {
      if (!text) {
        return { seq: null, sp: 0, q: '', webviewSrc: '', webviewUrl: '', detectedVideo: null }
      }
      // `liveUrl` = the tab's page the shell still has open — reuse it instead
      // of re-resolving the text (switching tabs must not reload the page).
      const target = liveUrl
        ? { src: liveUrl, url: liveUrl, domain: getDisplayDomain(liveUrl) }
        : resolveWebTarget(text)
      return {
        seq: { key: 'restore', text, phase: 'done', t0: Date.now() },
        sp: 1,
        q: text,
        webviewSrc: target.src,
        webviewUrl: target.url,
      }
    }
    const subOf = (t: string) => (t ? (/^\S+\.[a-zA-Z]{2,}/.test(t) ? 'Website' : 'Search') : 'Home')

    const allTabs = s.tabs.length > 0 ? s.tabs : [{ id: 1, text: curText || s.q || '', priv: s.cpriv }]
    const activeIndex = Math.max(0, Math.min(allTabs.length - 1, s.ci))

    // Helper to get effective title/text for a tab and heal any stale duplicated text
    const getTabEffectiveText = (t: TabItem, idx: number) => {
      if (idx === activeIndex) return (curText || s.q || t.text || '')
      const h = this.tabHistories[t.id]
      if ((!h || h.stack.length === 0) && t.text && t.text === curText) {
        return '' // Fresh new tab that had stale copied text
      }
      return t.text || ''
    }

    const switchToTab = (targetIdx: number) => {
      if (s.tsph || s.nph || s.nz || s.cl) return
      if (targetIdx === activeIndex && s.screen === 'browse') {
        if (s.sw) this.setState({ sw: false })
        return
      }
      const curTextVal = (pageUp && sq ? sq.text : '') || s.q || allTabs[activeIndex]?.text || ''
      const updatedTabs = allTabs.map((t, idx) =>
        idx === activeIndex ? { ...t, text: curTextVal, priv: s.cpriv } : t
      )
      const target = updatedTabs[targetIdx]
      if (!target) return
      const liveUrl = target.url
      const targetText = getTabEffectiveText(target, targetIdx) || (liveUrl ? getDisplayDomain(liveUrl) : '')
      const patch = {
        tabs: updatedTabs.map((t, idx) => (idx === targetIdx ? { ...t, text: targetText } : t)),
        ci: targetIdx,
        cpriv: !!target.priv,
        sw: false,
        screen: 'browse' as const,
      }
      if (liveUrl || this.liveShellTabs.has(target.id)) {
        // The shell still has this tab's page open — switch instantly to it
        // (flag fallback: a missed navState must not re-navigate the tab).
        this.suppressNav = true
        this.liveShellTabs.add(target.id)
        this.setState({
          ...patch,
          ...restore(targetText, liveUrl),
        } as any)
      } else if (targetText) {
        const resolved = resolveWebTarget(targetText)
        this.setState({
          ...patch,
          tabs: patch.tabs.map((t, idx) => (idx === targetIdx ? { ...t, url: resolved.src } : t)),
          ...restore(targetText),
        } as any)
      } else if (pageUp) {
        // Switching to an empty tab from a page plays the home sweep.
        this.setState({
          ...patch,
          seq: { ...sq!, phase: 'rdown' },
          sp: 0,
        } as any)
      } else {
        this.setState({
          ...patch,
          seq: null,
          sp: 0,
          q: '',
          webviewSrc: '',
          webviewUrl: '',
          detectedVideo: null,
        } as any)
      }
    }

    const busy = s.caOn || s.cl || s.tsph || s.nph || s.nz
    const dropTabById = (id: number) => {
      if (s.cl) return
      this.afterClose = () => {
        delete this.pos[String(id)]
        const k = allTabs.findIndex((x) => x.id === id)
        if (k < 0) return
        const remaining = allTabs.filter((x) => x.id !== id)
        if (remaining.length === 0) {
          const freshTab: TabItem = { id: Date.now(), text: '', priv: s.cpriv }
          this.setState({
            tabs: [freshTab],
            ci: 0,
            seq: null,
            sp: 0,
            q: '',
            webviewSrc: '',
            webviewUrl: '',
            detectedVideo: null,
          } as any)
          return
        }
        const nextCi = Math.max(0, Math.min(remaining.length - 1, activeIndex >= k ? activeIndex - 1 : activeIndex))
        const activeTab = remaining[nextCi]
        const effText = getTabEffectiveText(activeTab, nextCi)
        const liveUrl = activeTab.url
        this.liveShellTabs.delete(id)
        // Closing back to a tab the shell still has open must not re-drive it
        // (same flag fallback as switchToTab).
        if (liveUrl || this.liveShellTabs.has(activeTab.id)) this.suppressNav = true
        this.setState({
          tabs:
            liveUrl || !effText
              ? remaining
              : remaining.map((t, idx) =>
                  idx === nextCi ? { ...t, url: resolveWebTarget(effText).src } : t,
                ),
          ci: nextCi,
          cpriv: !!activeTab.priv,
          ...(effText ? restore(effText, liveUrl) : { seq: null, sp: 0, q: '', webviewSrc: '', webviewUrl: '', detectedVideo: null }),
        } as any)
      }
      this.setState({ cl: { id: String(id) }, cf: 0 })
    }

    const closeCurrent = () => {
      if (busy) return
      const curTab = allTabs[activeIndex]
      if (curTab && allTabs.length > 1) {
        dropTabById(curTab.id)
      } else if (pageUp && s.screen === 'browse') {
        // Single tab: closing it means going home — play the sweep.
        this.setState({ seq: { ...sq!, phase: 'rdown' }, sp: 0 })
      }
    }

    const closeAll = () => {
      if (busy || (!s.tabs.length && !pageUp)) return
      if (pageUp && s.screen === 'browse')
        this.setState({ caOn: true, cax: 0, seq: { ...s.seq!, phase: 'rdown' }, sp: 0 })
      else this.setState({ caOn: true, cax: 0 })
    }

    const closeSw = () => this.setState({ sw: false })
    const pop = (i: number) => {
      const c = Math.max(0, Math.min(1, (s.swt - 140 - i * 110) / 260))
      const e = 1 - Math.pow(1 - c, 3)
      return {
        opacity: e,
        transform: `translateY(${Math.round((1 - e) * 16)}px) scale(${(0.82 + 0.18 * e).toFixed(3)})`,
      }
    }

    const addFromSw = (e: React.MouseEvent) => {
      if (s.nz) return
      let r = { x: 240, y: 460, w: 340, h: 453 }
      const el = e && (e.currentTarget as HTMLElement)
      const root = el && (el.closest('[data-swroot]') as HTMLElement)
      if (el && root) {
        const a = el.getBoundingClientRect()
        const b = root.getBoundingClientRect()
        const k = root.offsetWidth / b.width
        r = {
          x: (a.left - b.left) * k,
          y: (a.top - b.top) * k,
          w: a.width * k,
          h: a.height * k,
        }
      }
      const curTextVal = (pageUp && sq ? sq.text : '') || s.q || allTabs[activeIndex]?.text || ''
      const updated = allTabs.map((t, idx) => (idx === activeIndex ? { ...t, text: curTextVal, priv: s.cpriv } : t))
      const newTabItem: TabItem = { id: Date.now(), text: '', priv: s.swm }
      debugLog(`addFromSw | tabs=${allTabs.length} ci=${activeIndex}`)
      const nt = [...updated, newTabItem]
      const base = {
        tabs: nt,
        ci: nt.length - 1,
        cpriv: s.swm,
        seq: null,
        sp: 0,
        q: '',
        screen: 'browse' as const,
      }
      this.setState({ nz: { ...r, base }, nzph: 'zoom', nzp: 0, nzf: 0 })
    }

    const nzz = s.nz ? (s.nzph === 'zoom' ? eio(s.nzp) : 1) : 0
    const nzStyle: React.CSSProperties = !s.nz
      ? { display: 'none' }
      : {
          position: 'absolute',
          left: Number((s.nz.x * (1 - nzz)).toFixed(1)),
          top: Number((s.nz.y * (1 - nzz)).toFixed(1)),
          width: Number((s.nz.w + ((s.vw || 820) - s.nz.w) * nzz).toFixed(1)),
          height: Number((s.nz.h + ((s.vh || 1180) - s.nz.h) * nzz).toFixed(1)),
          boxSizing: 'border-box',
          borderRadius: Math.round(20 * (1 - nzz)),
          background: '#0e0f14',
          border: `2px dashed rgba(74,80,104,${(1 - nzz).toFixed(2)})`,
          opacity: Number((s.nzph === 'fade' ? 1 - s.nzf : 1).toFixed(3)),
          pointerEvents: s.nzph === 'zoom' ? 'auto' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#b7a6ff',
          fontSize: 96,
          fontWeight: 300,
        }

    const swm = s.swm
    const vis = allTabs.filter((t) => !!t.priv === swm)
    const swCount = vis.length

    const tabCards = [
      ...vis.map((t, i) => {
        const isCur = t.id === allTabs[activeIndex]?.id
        const tabTitle = getTabEffectiveText(t, allTabs.findIndex((x) => x.id === t.id))
        return {
          id: String(t.id),
          title: tabTitle || (t.priv ? 'Private Browsing' : 'Start page'),
          sub: subOf(tabTitle) + (isCur ? ' · current' : ''),
          pop: pop(i),
          ring: isCur ? 'inset 0 0 0 3px #7c5cff' : 'none',
          open: () => {
            const idx = allTabs.findIndex((x) => x.id === t.id)
            if (idx >= 0) switchToTab(idx)
            closeSw()
          },
          close: () => dropTabById(t.id),
          canClose: allTabs.length > 1,
          dsp: 'block',
          isNew: false,
          cardIndex: i,
          canMoveLeft: i > 0,
          canMoveRight: i < vis.length - 1,
          moveLeft: () => {
            const fromIdx = allTabs.findIndex((x) => x.id === t.id)
            const toIdx = allTabs.findIndex((x) => x.id === vis[i - 1]?.id)
            if (fromIdx >= 0 && toIdx >= 0) this.reorderTabs(fromIdx, toIdx)
          },
          moveRight: () => {
            const fromIdx = allTabs.findIndex((x) => x.id === t.id)
            const toIdx = allTabs.findIndex((x) => x.id === vis[i + 1]?.id)
            if (fromIdx >= 0 && toIdx >= 0) this.reorderTabs(fromIdx, toIdx)
          },
        }
      }),
      ...(allTabs.length < 10
        ? [
            {
              id: 'new',
              title: '',
              sub: '',
              pop: pop(vis.length),
              ring: 'none',
              open: addFromSw,
              close: closeSw,
              canClose: false,
              dsp: 'none',
              isNew: true,
              cardIndex: -1,
              canMoveLeft: false,
              canMoveRight: false,
              moveLeft: () => {},
              moveRight: () => {},
            },
          ]
        : []),
    ]

    const newTab = () => {
      const pr = !!this.privNext
      this.privNext = false
      if (this.held) {
        this.held = false
        return
      }
      if (s.nph || allTabs.length >= 10) return
      this.sfGo = true
      debugLog(`newTab() priv=${pr} | tabs=${allTabs.length}`)
      // Mockup: the + morphs into a sliding pill; from a page the home sweep
      // runs behind it and doNewTab lands when the pill arrives.
      this.afterNew = () => doNewTab(pr)
      this.setState({
        nph: 'slide' as const,
        npp: 0,
        ...(pageUp && s.screen === 'browse'
          ? { seq: { ...sq!, phase: 'rdown' as const }, sp: 0 }
          : {}),
      } as any)
    }

    const doNewTab = (pr: boolean) => {
      debugLog(`doNewTab priv=${pr} | tabs=${allTabs.length} ci=${activeIndex}`)
      const curTextVal = (pageUp && sq ? sq.text : '') || s.q || allTabs[activeIndex]?.text || ''
      const updated = allTabs.map((t, idx) => (idx === activeIndex ? { ...t, text: curTextVal, priv: s.cpriv } : t))
      const newTabItem: TabItem = { id: Date.now(), text: '', priv: !!pr }
      const nt = [...updated, newTabItem]
      this.setState({
        tabs: nt,
        ci: nt.length - 1,
        cpriv: !!pr,
        seq: null,
        sp: 0,
        q: '',
        webviewSrc: '',
        webviewUrl: '',
        detectedVideo: null,
        screen: 'browse',
      })
    }

    const swk = this.swScale()
    const tabView = tabCards.map((c, i) => {
      const [tx, ty] = this.xy(i)
      const q = this.pos[c.id] || { x: tx, y: ty }
      const isMine = !!s.cl && s.cl.id === c.id
      const fo = isMine ? 1 - s.cf : 1
      const sc = isMine ? 1 - 0.08 * s.cf : 1
      return {
        ...c,
        slotStyle: {
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: Math.round(360 * swk),
          opacity: Number(fo.toFixed(3)),
          transform: `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) scale(${sc.toFixed(3)})`,
          pointerEvents: isMine ? ('none' as const) : ('auto' as const),
        },
      }
    })

    const gridH = Math.round(
      Math.max(
        0,
        ...tabCards.map((c, i) => (this.pos[c.id] ? this.pos[c.id].y : this.xy(i)[1]) + 528 * swk),
      ),
    )

    const nT = allTabs.length
    const pend = s.nph === 'slide' || s.nph === 'hold'
    const nL = nT + (pend ? 1 : 0)
    const nEnd = nL
    const lbl = (t: string, pv?: boolean) => t || (pv ? 'Private' : 'New tab')
    const titles = allTabs.map((t, idx) => {
      const isCur = idx === activeIndex
      const txt = getTabEffectiveText(t, idx)
      return lbl(txt, isCur ? s.cpriv : t.priv)
    })
    const privs = allTabs.map((t, idx) => (idx === activeIndex ? !!s.cpriv : !!t.priv))

    const goPill = (i: number) =>
      i === activeIndex
        ? () => {}
        : () => {
            if ((this.mv.sf || 0) > 6) return
            switchToTab(i)
          }

    const curMix = s.nph === 'slide' ? 1 - Math.min(1, s.npp / 0.35) : s.nph === 'hold' ? 0 : 1
    const mixc = (a: number[], b: number[], m: number) =>
      a.map((v, idx) => Math.round(b[idx] + (v - b[idx]) * m)).join(',')
    const pillCol = (cur: boolean) => {
      const m = cur ? curMix : 0
      return {
        background: `rgb(${mixc([124, 92, 255], [35, 39, 54], m)})`,
        color: `rgb(${mixc([255, 255, 255], [201, 206, 219], m)})`,
      }
    }

    const gT = this.geo(nL, 112, 148, 8, 64)
    const gU = this.geo(nT, 88, 120, 6, 52)
    const sxT = gT.over ? -s.sf * gT.range : 0
    const sxU = gU.over ? -s.sf * gU.range : 0

    const pillsTop =
      allTabs.length > 1 || (allTabs.length === 1 && !!allTabs[0].text)
        ? titles.map((title, i) => {
            const cur = i === activeIndex
            const tl = gT.base + i * gT.pitch
            const tw = gT.w
            const o =
              (cur && s.nph === 'out' ? 1 : s.pa) *
              (1 - s.swp) *
              (1 - s.cax) *
              (cur && s.cl && s.cl.id === 'cur' ? 1 - s.cf : 1)
            const cols = pillCol(cur)

            const isDragging = s.draggingTabIdx === i
            const dragOffset = isDragging ? s.dragTabOffset : 0

            let shiftOffset = 0
            if (s.draggingTabIdx !== null && !isDragging) {
              const dragFrom = s.draggingTabIdx
              const dragSteps = Math.round(s.dragTabOffset / (gT.pitch || 1))
              const dragTo = Math.max(0, Math.min(allTabs.length - 1, dragFrom + dragSteps))
              if (dragFrom < dragTo && i > dragFrom && i <= dragTo) {
                shiftOffset = -gT.pitch
              } else if (dragFrom > dragTo && i >= dragTo && i < dragFrom) {
                shiftOffset = gT.pitch
              }
            }

            return {
              title,
              index: i,
              style: {
                position: 'absolute' as const,
                left: Number((tl + sxT - 140 + dragOffset + shiftOffset).toFixed(1)),
                top: 20,
                width: Number(tw.toFixed(1)),
                height: 44,
                boxSizing: 'border-box' as const,
                borderRadius: 22,
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                fontWeight: 600,
                background: isDragging ? '#6347d9' : cols.background,
                color: cols.color,
                zIndex: isDragging ? 99 : (cur ? 20 : i + 1),
                boxShadow: isDragging
                  ? '0 16px 36px rgba(0,0,0,.6), 0 0 0 2px #b7a6ff'
                  : '0 8px 24px rgba(0,0,0,.4),-6px 0 14px rgba(0,0,0,.3)' +
                    (privs[i] ? ',inset 0 0 0 1.5px #b7a6ff' : ''),
                pointerEvents: o > 0.5 ? ('auto' as const) : ('none' as const),
                opacity: Number(o.toFixed(3)),
                cursor: isDragging ? 'grabbing' : (allTabs.length > 1 ? 'grab' : 'pointer'),
                transform: isDragging ? 'scale(1.08)' : 'scale(1)',
                transition: isDragging
                  ? 'transform 0.12s ease, box-shadow 0.12s ease'
                  : 'left 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease, width 0.32s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                willChange: 'left, width, transform',
                touchAction: 'none' as const,
                userSelect: 'none' as const,
                WebkitUserSelect: 'none' as const,
              },
              go: goPill(i),
            }
          })
        : []

    const dly = nT > 1 ? 0.5 / (nT - 1) : 0
    const pillsUnder =
      allTabs.length > 1 || (allTabs.length === 1 && !!allTabs[0].text)
        ? titles.map((title, i) => {
            const cur = i === activeIndex
            const o =
              Math.max(0, Math.min(1, (s.pb - i * dly) / 0.5)) *
              (1 - s.swp) *
              (1 - s.cax) *
              (cur && s.cl && s.cl.id === 'cur' ? 1 - s.cf : 1)
            const cols = pillCol(cur)
            return {
              title,
              style: {
                position: 'absolute' as const,
                left: Number((gU.base + i * gU.pitch + sxU - 140).toFixed(1)),
                top: 2,
                width: gU.w,
                height: 34,
                boxSizing: 'border-box' as const,
                borderRadius: 17,
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                background: cols.background,
                color: cols.color,
                zIndex: cur ? 20 : i + 1,
                boxShadow:
                  [
                    gU.pitch < gU.w + 6 ? '-6px 0 12px rgba(0,0,0,.35)' : '',
                    privs[i] ? 'inset 0 0 0 1.5px #b7a6ff' : '',
                  ]
                    .filter(Boolean)
                    .join(',') || 'none',
                pointerEvents: o > 0.5 ? ('auto' as const) : ('none' as const),
                opacity: Number(o.toFixed(3)),
                transition:
                  'left 0.32s cubic-bezier(0.16, 1, 0.3, 1), width 0.32s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease, color 0.2s ease, opacity 0.2s ease',
                willChange: 'left, width',
              },
              go: goPill(i),
            }
          })
        : []

    const edge = 'linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent)'
    const rgMax = Math.max(gT.range, gU.range) || 1

    const sDown = (e: React.PointerEvent) => {
      this.dr.sf = true
      this.mv.sf = 0
      this.lxs.sf = e.clientX
      this.sfGo = false
    }
    const sMove = (e: React.PointerEvent) => {
      if (!this.dr.sf) return
      const dx = e.clientX - this.lxs.sf
      this.lxs.sf = e.clientX
      this.mv.sf = (this.mv.sf || 0) + Math.abs(dx)
      if (this.mv.sf > 6 && !this.cap.sf) {
        this.cap.sf = true
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {}
      }
      this.setState({ sf: Math.max(0, Math.min(1, this.state.sf - dx / rgMax)) })
    }
    const sUp = () => {
      if (this.dr.sf) {
        this.dr.sf = false
        if (this.cap) this.cap['sf'] = false
      }
    }
    const sWheel = (e: React.WheelEvent) => {
      this.sfGo = false
      this.setState({
        sf: Math.max(0, Math.min(1, this.state.sf + (e.deltaX || e.deltaY || 0) / rgMax)),
      })
    }
    const npz = s.nph === 'slide' ? eio(s.npp) : s.nph ? 1 : 0
    const gE = this.geo(nEnd, 112, 148, 8, 64)
    const endL = gE.base + (nEnd - 1) * gE.pitch - (gE.over ? gE.range : 0)
    const endW = gE.w
    const plusFrac = Math.max(0, Math.min(1, (npz - 0.3) / 0.6))
    // The + button's left edge (right:20, 126px cluster) at the live width —
    // mockup hard-codes 674 for its 820 viewport.
    const plusX = (s.vw || 820) - 146

    const npStyle: React.CSSProperties = {
      position: 'absolute',
      left: Number((plusX + (endL - plusX) * npz).toFixed(1)),
      top: Number((48 + 8 * npz).toFixed(1)),
      width: Number((60 + (endW - 60) * npz).toFixed(1)),
      height: Number((60 - 16 * npz).toFixed(1)),
      boxSizing: 'border-box',
      borderRadius: Number((30 - 8 * npz).toFixed(1)),
      background: `rgba(124,92,255,${npz.toFixed(3)})`,
      color: npz > 0.3 ? '#fff' : '#e8eaf0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      pointerEvents: 'none',
      boxShadow: `0 8px 24px rgba(0,0,0,${(0.4 * npz).toFixed(2)})`,
    }

    const npLabel: React.CSSProperties = {
      fontSize: 15,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      width: Math.round(Math.max(0, endW - 28) * Math.min(1, npz * 1.2)),
      textAlign: 'center',
      marginLeft: Math.round(8 * (1 - plusFrac)),
      opacity: Number(Math.max(0, Math.min(1, (npz - 0.5) * 2)).toFixed(2)),
    }
    const npIc = Math.round(34 * (1 - plusFrac))

    const hbStyle: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      opacity: Number(s.hb.toFixed(2)),
      transform: `scale(${(0.7 + 0.3 * s.hb).toFixed(3)})`,
    }
    const hhStyle: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      opacity: Number((1 - s.hb).toFixed(2)),
      transform: `scale(${(0.7 + 0.3 * (1 - s.hb)).toFixed(3)})`,
    }
    const dwStyle: React.CSSProperties = {
      transform: `translateX(${Math.round(-340 * (1 - ez(s.dwp)))}px)`,
    }

    const barOf = (pct: number) => ({
      display: 'block',
      height: 6,
      borderRadius: 3,
      background: '#3ecf8e',
      width: `${pct}%`,
    })

    return (
      <div
        className="ipad-viewport-wrapper"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'stretch',
          overflow: 'hidden',
          padding: 0,
          margin: 0,
          background: '#0e0f14',
        }}
      >
        <div
          className="ipad-scaler"
          style={{
            width: '100%',
            height: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              padding: 0,
              borderRadius: 0,
              background: '#0e0f14',
              position: 'relative',
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            {/* Inner screen frame */}
            <div
              style={{
                width: '100%',
                height: '100%',
                flex: 1,
                borderRadius: 0,
                background: '#0e0f14',
                color: '#e8eaf0',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Main Content Area */}
              <main
                style={{
                  flex: 1,
                  position: 'relative',
                  overflow: 'hidden',
                  padding: (showResults && s.screen === 'browse') ? 0 : '0 clamp(16px, 4vw, 48px)',
                  boxSizing: 'border-box',
                }}
              >
                {/* 1. BROWSE SCREEN */}
                {s.screen === 'browse' && (
                  <div style={{ position: 'relative', height: '100%' }}>
                    {/* Header + Favorites / Recents stack */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 'calc(50% + 52px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 32,
                        clipPath: `inset(0 0 ${clipBv}px 0)`,
                        opacity: ph === 'rfade' ? s.sp : 1,
                        pointerEvents: sq ? 'none' : 'auto',
                      }}
                    >
                      <div style={{ position: 'relative', width: '100%', maxWidth: 560 }}>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 32,
                            opacity: (1 - s.pv).toFixed(3),
                            pointerEvents: s.pv < 0.5 ? 'auto' : 'none',
                          }}
                        >
                          {/* Favorites Section */}
                          <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#9aa3b2' }}>Favorites</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {favView.length > 0 && (
                                <div
                                  {...fm}
                                  ref={this.favStripRef}
                                  style={{
                                    touchAction: 'pan-y',
                                    cursor: favOver ? 'grab' : 'default',
                                    flex: 1,
                                    minWidth: 0,
                                    overflow: 'hidden',
                                    maskImage: favOver
                                      ? 'linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)'
                                      : 'none',
                                    WebkitMaskImage: favOver
                                      ? 'linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)'
                                      : 'none',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      width: 'max-content',
                                      transform: `translateX(${favOver ? norm(s.fx, fw) : 0}px)`,
                                    }}
                                  >
                                    {favView.map((f, idx) => (
                                      <button
                                        key={`f1-${idx}`}
                                        onClick={f.open}
                                        style={{
                                          width: f.w,
                                          opacity: f.o,
                                          overflow: 'hidden',
                                          flex: 'none',
                                          minHeight: 96,
                                          background: 'none',
                                          color: '#e8eaf0',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: 10,
                                        }}
                                      >
                                        <span
                                          style={{
                                            flex: 'none',
                                            width: 60,
                                            height: 60,
                                            borderRadius: 16,
                                            background: f.bg,
                                            color: f.ink,
                                            fontSize: 20,
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          {f.letter}
                                        </span>
                                        <span style={{ fontSize: 13 }}>{f.label}</span>
                                      </button>
                                    ))}
                                    {favOver && (
                                    <div aria-hidden="true" style={{ display: 'flex' }}>
                                      {favView.map((g, idx) => (
                                        <button
                                          key={`f2-${idx}`}
                                          onClick={g.open}
                                          style={{
                                            width: g.w,
                                            opacity: g.o,
                                            overflow: 'hidden',
                                            flex: 'none',
                                            minHeight: 96,
                                            background: 'none',
                                            color: '#e8eaf0',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 10,
                                          }}
                                        >
                                          <span
                                            style={{
                                              flex: 'none',
                                              width: 60,
                                              height: 60,
                                              borderRadius: 16,
                                              background: g.bg,
                                              color: g.ink,
                                              fontSize: 20,
                                              fontWeight: 700,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                            }}
                                          >
                                            {g.letter}
                                          </span>
                                          <span style={{ fontSize: 13 }}>{g.label}</span>
                                        </button>
                                      ))}
                                    </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              <button
                                aria-label="Add favorite"
                                onClick={() => {
                                  this.nm = ''
                                  this.ad = ''
                                  this.setState({ adding: true, pick: 0 })
                                }}
                                style={{
                                  flex: 'none',
                                  width: 84,
                                  minHeight: 96,
                                  background: 'none',
                                  color: '#9aa3b2',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 10,
                                }}
                              >
                                <span
                                  style={{
                                    width: 60,
                                    height: 60,
                                    borderRadius: 16,
                                    boxSizing: 'border-box',
                                    border: '2px dashed #4a5068',
                                    fontSize: 28,
                                    color: '#b7a6ff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  +
                                </span>
                                <span style={{ fontSize: 13 }}>Add</span>
                              </button>
                            </div>
                          </div>

                          {/* Recent Searches Section (only rendered when there are searches) */}
                          {rawRecents.length > 0 && (
                            <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#9aa3b2' }}>Recent searches</div>
                                <button
                                  type="button"
                                  onClick={this.clearRecentSearches}
                                  title="Clear recent searches"
                                  style={{
                                    background: 'none',
                                    border: 0,
                                    color: '#8b94a5',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                  }}
                                >
                                  Clear
                                </button>
                              </div>
                              <div
                                {...rm}
                                ref={this.recStripRef}
                                style={{
                                  touchAction: 'pan-y',
                                  cursor: recOver ? 'grab' : 'default',
                                  overflow: 'hidden',
                                  maskImage: recOver
                                    ? 'linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)'
                                    : 'none',
                                  WebkitMaskImage: recOver
                                    ? 'linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)'
                                    : 'none',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    width: 'max-content',
                                    transform: `translateX(${recOver ? norm(s.rx, rw) : 0}px)`,
                                  }}
                                >
                                  {rawRecents.map((t, idx) => (
                                    <button
                                      key={`r1-${idx}`}
                                      onClick={start('rec:' + t, t, 'rx')}
                                      style={{
                                        opacity: mine('rec:' + t),
                                        width: 120,
                                        flex: 'none',
                                        minHeight: 96,
                                        background: 'none',
                                        color: '#e8eaf0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 10,
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 60,
                                          height: 60,
                                          borderRadius: 16,
                                          background: '#2d2a55',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2">
                                          <circle cx="12" cy="12" r="9" />
                                          <path d="M12 7v5l3 2" />
                                        </svg>
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 13,
                                          textAlign: 'center',
                                          maxWidth: 104,
                                          overflow: 'hidden',
                                          whiteSpace: 'nowrap',
                                          textOverflow: 'ellipsis',
                                        }}
                                      >
                                        {clip(t)}
                                      </span>
                                    </button>
                                  ))}
                                  {recOver && (
                                  <div aria-hidden="true" style={{ display: 'flex' }}>
                                    {rawRecents.map((q, idx) => (
                                      <button
                                        key={`r2-${idx}`}
                                        onClick={start('rec:' + q, q, 'rx')}
                                        style={{
                                          opacity: mine('rec:' + q),
                                          width: 120,
                                          flex: 'none',
                                          minHeight: 96,
                                          background: 'none',
                                          color: '#e8eaf0',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: 10,
                                        }}
                                      >
                                        <span
                                          style={{
                                            width: 60,
                                            height: 60,
                                            borderRadius: 16,
                                            background: '#2d2a55',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2">
                                            <circle cx="12" cy="12" r="9" />
                                            <path d="M12 7v5l3 2" />
                                          </svg>
                                        </span>
                                        <span
                                          style={{
                                            fontSize: 13,
                                            textAlign: 'center',
                                            maxWidth: 104,
                                            overflow: 'hidden',
                                            whiteSpace: 'nowrap',
                                            textOverflow: 'ellipsis',
                                          }}
                                        >
                                          {clip(q)}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Private Browsing Badge Overlay */}
                        <div style={{ position: 'absolute', inset: 0, opacity: s.pv.toFixed(3), pointerEvents: 'none' }}>
                          <div
                            style={{
                              boxSizing: 'border-box',
                              width: '100%',
                              height: '100%',
                              borderRadius: 28,
                              background: '#171326',
                              boxShadow: 'inset 0 0 0 1.5px #3b2f6b',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 16,
                            }}
                          >
                            <span
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 18,
                                background: '#2d2a55',
                                color: '#b7a6ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3l18 18" />
                                <path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4.2 9.5 6a14 14 0 01-2.7 3.3M6.4 7.6A14 14 0 002.5 12c1 1.8 4.5 6 9.5 6a9.8 9.8 0 004-.9" />
                                <path d="M9.9 9.9a3 3 0 004.2 4.2" />
                              </svg>
                            </span>
                            <div style={{ fontSize: 26, fontWeight: 700 }}>Private Browsing</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      ref={this.barWrapRef}
                      style={{
                        position: 'absolute',
                        left: `${Math.round(180 * barUpP)}px`,
                        right: `${Math.round(152 * barUpP)}px`,
                        top: `calc(${(1 - barUpP) * 50}% + ${Math.round(-30 + 78 * barUpP)}px)`,
                        // Below-home overshoot of the reverse sweep (0 everywhere else).
                        transform: barShiftY ? `translateY(${barShiftY}px)` : undefined,
                        display: 'flex',
                        justifyContent: 'center',
                        zIndex: 35,
                        pointerEvents: 'auto',
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          minWidth: 0,
                          maxWidth: Math.round(s.barW.home + (s.barW.dock - s.barW.home) * barWp),
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: -5,
                            right: -5,
                            top: -5,
                            bottom: -5,
                            borderRadius: 35,
                            border: '2px solid #b7a6ff',
                            boxShadow:
                              '0 0 22px 4px rgba(124,92,255,.85),inset 0 0 14px rgba(124,92,255,.5)',
                            opacity: laser,
                            pointerEvents: 'none',
                          }}
                        />
                        {runner && (
                          <svg
                            viewBox="0 0 502 70"
                            preserveAspectRatio="none"
                            fill="none"
                            style={{
                              position: 'absolute',
                              left: -5,
                              top: -5,
                              width: 'calc(100% + 10px)',
                              height: 'calc(100% + 10px)',
                              pointerEvents: 'none',
                              opacity: runOp,
                              filter: 'drop-shadow(0 0 7px #9b83ff)',
                            }}
                          >
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#7c5cff"
                              strokeOpacity={rr[4].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[4].da}
                              strokeDashoffset={rr[4].off}
                            />
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#9b83ff"
                              strokeOpacity={rr[3].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[3].da}
                              strokeDashoffset={rr[3].off}
                            />
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#b7a6ff"
                              strokeOpacity={rr[2].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[2].da}
                              strokeDashoffset={rr[2].off}
                            />
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#d6ccff"
                              strokeOpacity={rr[1].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[1].da}
                              strokeDashoffset={rr[1].off}
                            />
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#ffffff"
                              strokeOpacity={rr[0].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[0].da}
                              strokeDashoffset={rr[0].off}
                            />
                          </svg>
                        )}
                        {loading && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              top: 76,
                              textAlign: 'center',
                              fontSize: 13,
                              color: '#9aa3b2',
                            }}
                          >
                            {status}
                          </div>
                        )}
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#9aa3b2"
                          strokeWidth="2"
                          style={{ position: 'absolute', left: 22, top: 19 }}
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="M20 20l-4-4" />
                        </svg>
                        <input
                          type="text"
                          ref={this.qInputRef}
                          aria-label="Search or enter website name"
                          placeholder="Search or enter website name"
                          value={qText}
                          onFocus={() => {
                            // Capture the pre-edit value once per focus so a
                            // blur without a search can restore it (Chrome
                            // omnibox behavior). The clear button suppresses
                            // its programmatic refocus capture.
                            if (!this.suppressQSnap) this.qOrig = s.q
                            this.suppressQSnap = false
                            this.setState({
                              searchFocused: true,
                              q: isBarUp ? (s.webviewUrl || s.q || '') : s.q,
                            })
                          }}
                          onBlur={() => {
                            this.suppressQSnap = false
                            this.setState({
                              searchFocused: false,
                              // Browser omnibox behavior: an edit that never
                              // committed snaps back to the original text.
                              q: this.state.q !== this.qOrig ? this.qOrig : this.state.q,
                            })
                          }}
                          onChange={(e) => this.setState({ q: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            const t = (s.q || '').trim()
                            if (!t) return
                            ;(e.currentTarget as HTMLInputElement).blur()
                            this.executeSearch(t)
                          }}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            height: 60,
                            boxSizing: 'border-box',
                            borderRadius: 30,
                            border: 0,
                            background: '#1d2029',
                            color: `rgba(232,234,240,${qAlpha})`,
                            fontSize: 17,
                            fontFamily: 'inherit',
                            padding: xOn ? '0 58px 0 58px' : '0 24px 0 58px',
                            boxShadow: '0 8px 28px rgba(0,0,0,.35)',
                          }}
                        />
                        {xOn && (
                          <button
                            type="button"
                            aria-label="Clear search"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              // Keep the keyboard up: clear the text, force
                              // focus and let the user type straight away.
                              this.suppressQSnap = true
                              this.setState({ q: '', searchFocused: true })
                              this.qInputRef.current?.focus()
                            }}
                            style={{
                              position: 'absolute',
                              right: 18,
                              top: 16,
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              background: '#2d3142',
                              color: '#9aa3b2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              border: 0,
                              padding: 0,
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {isBarUp && !s.searchFocused && (
                          <button
                            type="button"
                            aria-label="Refresh page"
                            title="Refresh page"
                            onClick={this.triggerRefresh}
                            style={{
                              position: 'absolute',
                              right: 18,
                              top: 18,
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              background: 'none',
                              color: s.isRefreshing ? '#3ecf8e' : '#9aa3b2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              border: 0,
                              transition: 'transform 0.15s ease, color 0.15s ease',
                            }}
                          >
                            <svg className={s.isRefreshing ? 'animate-spin' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-1.19" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {showResults && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: resTop,
                          bottom: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          background: hasNativeShell() ? 'transparent' : '#0e0f14',
                          zIndex: 15,
                          // During `scan` the slot exists only to be measured
                          // for the hidden native pane — keep it invisible and
                          // touch-through until `load`.
                          opacity: hasNativeShell() && ph === 'scan' ? 0 : resOp,
                          pointerEvents: hasNativeShell() && ph === 'scan' ? 'none' : 'auto',
                          transform: `translateY(${resY}px)`,
                          clipPath: `inset(${resClip}px 0 0 0)`,
                          WebkitClipPath: `inset(${resClip}px 0 0 0)`,
                        }}
                      >
                        {/* Pure-web demo only: the iframe swallows pointer
                            events, so this strip is the demo's pull entry
                            point. Hidden under the native shell — there the
                            page itself detects the pull (PULL_JS) and the
                            browser runs full-bleed to the container top. */}
                        {!hasNativeShell() && (
                          <div
                            onPointerDown={(e) => {
                              this.handlePullStart(e.clientY)
                              try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
                            }}
                            onPointerMove={(e) => this.handlePullMove(e.clientY)}
                            onPointerUp={this.handlePullEnd}
                            onPointerCancel={this.handlePullEnd}
                            style={{
                              height: 20,
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'grab',
                              touchAction: 'none',
                              zIndex: 35,
                              background: 'linear-gradient(180deg, rgba(31,34,48,0.6) 0%, rgba(31,34,48,0) 100%)',
                            }}
                            title="Pull down to refresh"
                          >
                            <div style={{ width: 36, height: 3.5, borderRadius: 2, background: 'rgba(255,255,255,0.22)' }} />
                          </div>
                        )}

                        {/* Live Browser Surface */}
                        <div
                          ref={this.browserSlotRef}
                          className="browser-slot"
                          onPointerDown={(e) => {
                            if (e.clientY < 260) {
                              this.handlePullStart(e.clientY)
                              try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
                            }
                          }}
                          onPointerMove={(e) => this.handlePullMove(e.clientY)}
                          onPointerUp={this.handlePullEnd}
                          onPointerCancel={this.handlePullEnd}
                          style={{
                            flex: 1,
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden',
                            background: hasNativeShell() ? 'transparent' : '#0d0e14',
                            position: 'relative',
                            touchAction: 'pan-x pan-y',
                          }}
                        >
                          {/* Pull to refresh visual indicator badge */}
                          {(s.pullY > 0 || s.isRefreshing) && (
                            <div
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: s.pullY,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                pointerEvents: 'none',
                                zIndex: 40,
                                overflow: 'hidden',
                                transition: s.isPulling ? 'none' : 'height 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                              }}
                            >
                              <div
                                style={{
                                  background: 'rgba(26, 29, 41, 0.95)',
                                  backdropFilter: 'blur(12px)',
                                  WebkitBackdropFilter: 'blur(12px)',
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px #33384c',
                                  borderRadius: 20,
                                  padding: '7px 16px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 9,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: s.isRefreshing || s.refreshedToast ? '#3ecf8e' : s.pullY >= 50 ? '#b7a6ff' : '#9aa3b2',
                                  transform: `scale(${Math.min(1, Math.max(0.75, s.pullY / 50))})`,
                                  transition: 'color 0.2s ease, transform 0.15s ease',
                                }}
                              >
                                {s.isRefreshing ? (
                                  <>
                                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                      <path d="M12 2a10 10 0 0 1 10 10" />
                                    </svg>
                                    <span>Refreshing…</span>
                                  </>
                                ) : s.refreshedToast ? (
                                  <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Refreshed</span>
                                  </>
                                ) : (
                                  <>
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      style={{
                                        transform: `rotate(${Math.min(180, (s.pullY / 50) * 180)}deg)`,
                                        transition: 'transform 0.1s ease',
                                      }}
                                    >
                                      <path d="M12 5v14M5 12l7 7 7-7" />
                                    </svg>
                                    <span>{s.pullY >= 50 ? 'Release to refresh' : 'Pull to refresh'}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Pull-to-refresh invisible shield during active gesture so iframes don't steal pointer events */}
                          {s.isPulling && (
                            <div style={{ position: 'absolute', inset: 0, zIndex: 35, background: 'transparent' }} />
                          )}

                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              transform: `translateY(${s.pullY}px)`,
                              transition: s.isPulling ? 'none' : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}
                          >
                            {!hasNativeShell() && (
                              <iframe
                                key={s.refreshKey}
                                className="safari-webview-frame"
                                title="Browsing Session"
                                src={s.webviewSrc || resolveWebTarget(resTitle).src}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  border: 'none',
                                  display: 'block',
                                  background: '#0e0f14',
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. DOWNLOADS SCREEN */}
                {s.screen === 'down' && (
                  <div style={{ position: 'relative', height: '100%' }}>
                    <div
                      onScroll={onSc('dl')}
                      style={{
                        height: '100%',
                        boxSizing: 'border-box',
                        overflowY: 'auto',
                        padding: '58px 0 28px',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: 680,
                          margin: '0 auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 16,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              background: '#7c5cff',
                              boxShadow: '0 8px 28px rgba(124,92,255,.45)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <div
                              style={{
                                borderLeft: '13px solid #fff',
                                borderTop: '8px solid transparent',
                                borderBottom: '8px solid transparent',
                                marginLeft: 3,
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 700 }}>Downloads</div>
                          <div style={{ fontSize: 16, color: '#9aa3b2' }}>
                            {dlActive} active · {dlActive ? '5.8 MB/s' : 'idle'}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            alignItems: 'center',
                            padding: '14px 16px',
                            borderRadius: 16,
                            background: 'rgba(245,184,74,.12)',
                            boxShadow: 'inset 0 0 0 1px rgba(245,184,74,.35)',
                            color: '#f5b84a',
                            fontSize: 15,
                          }}
                        >
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                            <path d="M12 4l9 16H3z" />
                            <path d="M12 10v4M12 17v.5" />
                          </svg>
                          <span>Storage space: 42 GB available. Unlimited parallel transfers active.</span>
                        </div>

                        {dlRows.length === 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0', textAlign: 'center' }}>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 12,
                                background: '#7c5cff',
                                boxShadow: '0 8px 28px rgba(124,92,255,.45)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <div
                                style={{
                                  borderLeft: '13px solid #fff',
                                  borderTop: '8px solid transparent',
                                  borderBottom: '8px solid transparent',
                                  marginLeft: 3,
                                }}
                              />
                            </div>
                            <div style={{ fontSize: 17, color: '#c9cedb', maxWidth: 420 }}>
                              No active transfers right now. Search any video or paste a link to download!
                            </div>
                            <button
                              onClick={() => this.setState({ screen: 'browse' })}
                              style={{
                                minHeight: 52,
                                padding: '0 28px',
                                borderRadius: 26,
                                background: '#7c5cff',
                                color: '#fff',
                                fontSize: 17,
                                fontWeight: 700,
                              }}
                            >
                              Go to Search
                            </button>
                          </div>
                        )}

                        {dlRows.map((r, i) => (
                          <div key={i} style={{ animation: `vdpop .42s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 40}ms` }}>
                            <div style={{ padding: 16, borderRadius: 20, background: '#181a22', display: 'flex', flexDirection: 'column', gap: 12 }}>
                              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <button
                                  aria-label="Details"
                                  onClick={r.toggleEx}
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    gap: 14,
                                    alignItems: 'center',
                                    background: 'none',
                                    color: 'inherit',
                                    textAlign: 'left',
                                    padding: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      flex: 'none',
                                      padding: 3,
                                      borderRadius: 16,
                                      background: `conic-gradient(${r.isErr ? '#ff7a9c' : r.color} ${r.isErr ? 100 : r.pct}%,#2b3140 0)`,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 84,
                                        height: 58,
                                        borderRadius: 13,
                                        background: 'linear-gradient(135deg,#34304f,#1a1c27)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {r.audio ? (
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M9 18V6l10-2v12" />
                                          <circle cx="6.5" cy="18" r="2.5" />
                                          <circle cx="16.5" cy="16" r="2.5" />
                                        </svg>
                                      ) : (
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.8" strokeLinejoin="round">
                                          <rect x="3" y="5" width="18" height="14" rx="3" />
                                          <path d="M10 9.5v5l4.5-2.5z" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <div style={{ fontSize: 17, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                      {r.title}
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: r.subInk }}>{r.sub}</div>
                                  </div>
                                </button>
                                {r.canPause && (
                                  <button
                                    aria-label={r.pauseLbl}
                                    onClick={r.togglePause}
                                    style={{
                                      flex: 'none',
                                      width: 48,
                                      height: 48,
                                      borderRadius: 24,
                                      background: '#232736',
                                      color: '#e8eaf0',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {r.notPaused ? (
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <rect x="6" y="5" width="4" height="14" rx="1.2" />
                                        <rect x="14" y="5" width="4" height="14" rx="1.2" />
                                      </svg>
                                    ) : (
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M8 5v14l11-7z" />
                                      </svg>
                                    )}
                                  </button>
                                )}
                                <button
                                  aria-label="Remove from list"
                                  onClick={r.remove}
                                  style={{
                                    flex: 'none',
                                    width: 48,
                                    height: 48,
                                    borderRadius: 24,
                                    background: '#232736',
                                    color: '#e8eaf0',
                                    fontSize: 24,
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                              {r.showBar && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ height: 6, borderRadius: 3, background: '#2b3140' }}>
                                    <div
                                      style={{
                                        display: 'block',
                                        height: 6,
                                        borderRadius: 3,
                                        background: r.color,
                                        width: `${r.pct}%`,
                                      }}
                                    />
                                  </div>
                                  <div style={{ fontSize: 14, color: '#9aa3b2' }}>{r.meta}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={thumb('dl')} />
                  </div>
                )}

                {/* 3. LIBRARY SCREEN */}
                {s.screen === 'lib' && (
                  <div style={{ position: 'relative', height: '100%' }}>
                    <div
                      onScroll={onSc('lib')}
                      style={{
                        height: '100%',
                        boxSizing: 'border-box',
                        overflowY: 'auto',
                        padding: '58px 0 96px',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: cards ? 1100 : 680,
                          margin: '0 auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 16,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              background: '#7c5cff',
                              boxShadow: '0 8px 28px rgba(124,92,255,.45)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <div
                              style={{
                                borderLeft: '13px solid #fff',
                                borderTop: '8px solid transparent',
                                borderBottom: '8px solid transparent',
                                marginLeft: 3,
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 700 }}>Library</div>
                          <div style={{ fontSize: 16, color: '#9aa3b2' }}>
                            {(mbTotal >= 1024 ? (mbTotal / 1024).toFixed(1) + ' GB' : mbTotal + ' MB') +
                              ' in ' +
                              libAll.length +
                              ' files · 42 GB free'}
                          </div>
                        </div>

                        {/* Filter Chips */}
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => this.setState({ lf: 0, ld: null })} style={chip(s.lf === 0)}>
                            All
                          </button>
                          <button onClick={() => this.setState({ lf: 1, ld: null })} style={chip(s.lf === 1)}>
                            Video
                          </button>
                          <button onClick={() => this.setState({ lf: 2, ld: null })} style={chip(s.lf === 2)}>
                            Audio
                          </button>
                        </div>

                        {/* Search in Library */}
                        <div style={{ position: 'relative' }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9aa3b2" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 20, top: 19 }}>
                            <circle cx="11" cy="11" r="7" />
                            <path d="M20 20l-4-4" />
                          </svg>
                          <input
                            type="text"
                            aria-label="Search Library"
                            placeholder="Search Library"
                            value={s.lq}
                            onInput={(e: any) => this.setState({ lq: e.target.value })}
                            style={{
                              width: '100%',
                              height: 60,
                              boxSizing: 'border-box',
                              borderRadius: 30,
                              border: 0,
                              background: '#1d2029',
                              color: '#e8eaf0',
                              fontSize: 17,
                              fontFamily: 'inherit',
                              padding: '0 24px 0 54px',
                              boxShadow: '0 8px 28px rgba(0,0,0,.35)',
                            }}
                          />
                        </div>

                        {/* Empty Library state */}
                        {libRows.length === 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0', textAlign: 'center' }}>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 12,
                                background: '#7c5cff',
                                boxShadow: '0 8px 28px rgba(124,92,255,.45)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <div
                                style={{
                                  borderLeft: '13px solid #fff',
                                  borderTop: '8px solid transparent',
                                  borderBottom: '8px solid transparent',
                                  marginLeft: 3,
                                }}
                              />
                            </div>
                            <div style={{ fontSize: 17, color: '#c9cedb', maxWidth: 420 }}>
                              {qs ? 'No matches for that search.' : 'Nothing here yet. Search and download videos to build your library!'}
                            </div>
                            <button
                              onClick={() => this.setState({ screen: 'browse' })}
                              style={{
                                minHeight: 52,
                                padding: '0 28px',
                                borderRadius: 26,
                                background: '#7c5cff',
                                color: '#fff',
                                fontSize: 17,
                                fontWeight: 700,
                              }}
                            >
                              Go to Search
                            </button>
                          </div>
                        )}

                        {/* Library Grid / List */}
                        <div
                          style={{
                            display: 'grid',
                            gap: 14,
                            gridTemplateColumns: cards ? 'repeat(auto-fill,minmax(200px,1fr))' : '1fr',
                            transition: 'all .25s ease',
                          }}
                        >
                          {libRows.map((r) => (
                            <div key={r.id} style={{ position: 'relative', zIndex: s.hmenu === r.id ? 9 : 0, opacity: r.missing ? 0.55 : 1 }}>
                              {r.isCard ? (
                                <div
                                  style={{
                                    position: 'relative',
                                    height: 210,
                                    borderRadius: 22,
                                    overflow: 'hidden',
                                    background: 'linear-gradient(135deg,#3a3560,#171826)',
                                    boxShadow: r.picked ? 'inset 0 0 0 2px #7c5cff' : '0 10px 28px rgba(0,0,0,.35)',
                                    transition: 'box-shadow .25s ease',
                                  }}
                                >
                                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.28 }}>
                                    {r.audio ? (
                                      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 18V6l10-2v12" />
                                        <circle cx="6.5" cy="18" r="2.5" />
                                        <circle cx="16.5" cy="16" r="2.5" />
                                      </svg>
                                    ) : (
                                      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinejoin="round">
                                        <rect x="3" y="5" width="18" height="14" rx="3" />
                                        <path d="M10 9.5v5l4.5-2.5z" />
                                      </svg>
                                    )}
                                  </div>
                                  <button
                                    aria-label={r.title}
                                    onClick={r.tap}
                                    onPointerDown={r.down}
                                    onPointerUp={r.up}
                                    onPointerCancel={r.up}
                                    onPointerLeave={r.up}
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      width: '100%',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'flex-end',
                                      background: 'none',
                                      color: 'inherit',
                                      textAlign: 'left',
                                      padding: 0,
                                    }}
                                  >
                                    <div style={{ padding: '48px 16px 14px', background: 'linear-gradient(to top,rgba(9,10,15,.92),rgba(9,10,15,0))' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                          {r.title}
                                        </span>
                                        {r.showNew && <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 4, background: '#9d83ff' }} />}
                                      </div>
                                      {r.showSub && <div style={{ marginTop: 3, fontSize: 13, color: r.subInk }}>{r.sub}</div>}
                                    </div>
                                  </button>
                                  {r.selOn && (
                                    <span
                                      style={{
                                        position: 'absolute',
                                        left: 10,
                                        top: 10,
                                        zIndex: 2,
                                        width: 26,
                                        height: 26,
                                        borderRadius: 13,
                                        boxSizing: 'border-box',
                                        border: '2px solid #e8eaf0',
                                        background: 'rgba(0,0,0,.4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {r.picked && <span style={{ width: 16, height: 16, borderRadius: 8, background: '#7c5cff' }} />}
                                    </span>
                                  )}
                                  {r.showActs && (
                                    <button
                                      aria-label="More"
                                      onClick={r.mOpen}
                                      style={{
                                        position: 'absolute',
                                        right: 10,
                                        top: 10,
                                        width: 40,
                                        height: 40,
                                        borderRadius: 20,
                                        background: 'rgba(10,11,16,.5)',
                                        color: '#e8eaf0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="5" cy="12" r="1.8" />
                                        <circle cx="12" cy="12" r="1.8" />
                                        <circle cx="19" cy="12" r="1.8" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    position: 'relative',
                                    display: 'flex',
                                    gap: 14,
                                    alignItems: 'center',
                                    padding: '10px',
                                    borderRadius: 20,
                                    background: '#14161d',
                                    boxShadow: r.picked ? 'inset 0 0 0 2px #7c5cff' : 'inset 0 0 0 1px rgba(255,255,255,.04)',
                                    transition: 'box-shadow .25s ease',
                                  }}
                                >
                                  <button
                                    aria-label={r.title}
                                    onClick={r.tap}
                                    onPointerDown={r.down}
                                    onPointerUp={r.up}
                                    onPointerCancel={r.up}
                                    onPointerLeave={r.up}
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      display: 'flex',
                                      gap: 14,
                                      alignItems: 'center',
                                      background: 'none',
                                      color: 'inherit',
                                      textAlign: 'left',
                                      padding: 0,
                                    }}
                                  >
                                    <div
                                      style={{
                                        position: 'relative',
                                        flex: 'none',
                                        width: 96,
                                        height: 64,
                                        borderRadius: 14,
                                        overflow: 'hidden',
                                        background: 'linear-gradient(135deg,#3a3560,#171826)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {r.audio ? (
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M9 18V6l10-2v12" />
                                          <circle cx="6.5" cy="18" r="2.5" />
                                          <circle cx="16.5" cy="16" r="2.5" />
                                        </svg>
                                      ) : (
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinejoin="round">
                                          <rect x="3" y="5" width="18" height="14" rx="3" />
                                          <path d="M10 9.5v5l4.5-2.5z" />
                                        </svg>
                                      )}
                                      {r.selOn && (
                                        <span
                                          style={{
                                            position: 'absolute',
                                            left: 5,
                                            top: 5,
                                            width: 26,
                                            height: 26,
                                            borderRadius: 13,
                                            boxSizing: 'border-box',
                                            border: '2px solid #e8eaf0',
                                            background: 'rgba(0,0,0,.4)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          {r.picked && <span style={{ width: 16, height: 16, borderRadius: 8, background: '#7c5cff' }} />}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                          {r.title}
                                        </span>
                                        {r.showNew && <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 4, background: '#9d83ff' }} />}
                                      </div>
                                      <div style={{ fontSize: 13, color: r.subInk }}>{r.sub}</div>
                                    </div>
                                  </button>
                                  {r.showActs && (
                                    <button
                                      aria-label="More"
                                      onClick={r.mOpen}
                                      style={{
                                        flex: 'none',
                                        width: 44,
                                        height: 44,
                                        borderRadius: 22,
                                        background: 'none',
                                        color: '#9aa3b2',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="5" cy="12" r="1.8" />
                                        <circle cx="12" cy="12" r="1.8" />
                                        <circle cx="19" cy="12" r="1.8" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Delete confirmation inline */}
                              {r.conf && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '12px 14px',
                                    borderRadius: 14,
                                    background: 'rgba(255,122,156,.12)',
                                    boxShadow: 'inset 0 0 0 1px rgba(255,122,156,.3)',
                                    marginTop: 8,
                                  }}
                                >
                                  <span style={{ flex: 1, fontSize: 15, color: '#ffd0dc' }}>Delete this file? This can't be undone.</span>
                                  <button onClick={r.no} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, background: '#232736', color: '#e8eaf0', fontSize: 15, fontWeight: 600 }}>Cancel</button>
                                  <button onClick={r.yes} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, background: '#ff5c85', color: '#fff', fontSize: 15, fontWeight: 700 }}>Delete</button>
                                </div>
                              )}

                              {/* Item Action Popover Menu */}
                              {r.menuOn && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    right: 14,
                                    top: 14,
                                    zIndex: 9,
                                    width: 250,
                                    transformOrigin: 'top right',
                                    boxSizing: 'border-box',
                                    padding: 8,
                                    borderRadius: 20,
                                    background: '#1f2230',
                                    boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 2,
                                  }}
                                >
                                  <button onClick={r.mPlay} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5v14l11-7z" /></svg>
                                    </span>
                                    Play
                                  </button>
                                  <button onClick={r.mShare} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7" /></svg>
                                    </span>
                                    Share
                                  </button>
                                  <button onClick={r.mInfo} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
                                    </span>
                                    Info
                                  </button>
                                  <button onClick={r.mSel} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></svg>
                                    </span>
                                    Select
                                  </button>
                                  <button onClick={r.mDel} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#ff8fab' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: 'rgba(255,122,156,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff8fab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>
                                    </span>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={thumb('lib')} />

                    {/* Popover backdrop closer */}
                    {s.hmenu !== null && (
                      <div onClick={() => this.setState({ hmenu: null })} style={{ position: 'absolute', inset: 0, zIndex: 8 }} />
                    )}

                    {/* Bulk Selection Bar */}
                    {s.sel && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 16,
                          zIndex: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '12px 14px',
                          borderRadius: 22,
                          background: '#1f2230',
                          boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                        }}
                      >
                        {!s.selConf ? (
                          <>
                            <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{selCount} selected</span>
                            <button style={{ minHeight: 48, padding: '0 20px', borderRadius: 14, background: '#232736', color: '#e8eaf0', fontSize: 16, fontWeight: 600 }}>Share</button>
                            <button
                              onClick={() => this.setState({ selConf: true })}
                              style={{ minHeight: 48, padding: '0 20px', borderRadius: 14, background: 'rgba(255,122,156,.16)', color: '#ff7a9c', fontSize: 16, fontWeight: 600 }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 1, fontSize: 15, color: '#ffd0dc' }}>Delete {selCount} files? This can't be undone.</span>
                            <button onClick={() => this.setState({ selConf: false })} style={{ minHeight: 48, padding: '0 18px', borderRadius: 12, background: '#232736', color: '#e8eaf0', fontSize: 15, fontWeight: 600 }}>Cancel</button>
                            <button
                              onClick={() => {
                                const nextLib = s.lib.filter((x) => !s.selIds.includes(x.id))
                                this.setState({
                                  lib: nextLib,
                                  jobs: s.jobs.filter((x) => !s.selIds.includes('j' + x.id)),
                                  sel: false,
                                  selIds: [],
                                  selConf: false,
                                }, this.saveStorage)
                              }}
                              style={{ minHeight: 48, padding: '0 18px', borderRadius: 12, background: '#ff5c85', color: '#fff', fontSize: 15, fontWeight: 700 }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Info Sheet & Storage Sheet Bottom Drawer */}
                    {(!!infoItem || s.stOpen) && (
                      <>
                        <div onClick={() => this.setState({ info: null, stOpen: false })} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,.55)' }} />
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 21,
                            boxSizing: 'border-box',
                            padding: 24,
                            borderRadius: '24px 24px 0 0',
                            background: '#1f2230',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14,
                            boxShadow: '0 -16px 40px rgba(0,0,0,.5),inset 0 1px 0 #2d3144',
                          }}
                        >
                          <div style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, background: '#3a3f55' }} />
                          {infoItem && (
                            <>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>{infoItem.title}</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 20px', fontSize: 15 }}>
                                <span style={{ color: '#9aa3b2' }}>Format</span><span>{infoItem.fmt}</span>
                                <span style={{ color: '#9aa3b2' }}>Size</span><span>{infoItem.size}</span>
                                <span style={{ color: '#9aa3b2' }}>Duration</span><span>{infoItem.dur || '—'}</span>
                                <span style={{ color: '#9aa3b2' }}>Saved</span><span>{infoItem.when}</span>
                                <span style={{ color: '#9aa3b2' }}>Source</span><span>{infoItem.src}</span>
                              </div>
                              <button
                                onClick={() => {
                                  this.setState({
                                    info: null,
                                    screen: 'browse',
                                    seq: { key: 'typed', text: infoItem.src, phase: 'scan' },
                                    q: infoItem.src,
                                  })
                                }}
                                style={{ minHeight: 52, borderRadius: 14, background: '#7c5cff', color: '#fff', fontSize: 17, fontWeight: 700 }}
                              >
                                Open source page
                              </button>
                            </>
                          )}
                          {s.stOpen && (
                            <>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>Settings &amp; Storage</div>
                              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#2b3140' }}>
                                <div style={{ width: `${(vMb / tMb * 100).toFixed(2)}%`, minWidth: 4, background: '#7c5cff' }} />
                                <div style={{ width: `${(aMb / tMb * 100).toFixed(2)}%`, minWidth: 4, background: '#3ecf8e' }} />
                              </div>
                              <div style={{ display: 'flex', gap: 18, fontSize: 14, color: '#9aa3b2' }}>
                                <span>Video {fmtMb(vMb)}</span>
                                <span>Audio {fmtMb(aMb)}</span>
                                <span>Free 42 GB</span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#9aa3b2' }}>Largest files</div>
                              {largest.map((l, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{l.title}</span>
                                  <span style={{ color: '#9aa3b2' }}>{l.size}</span>
                                </div>
                              ))}
                              <button
                                onClick={() => this.setState({ stOpen: false, sel: true, selIds: [...libAll].sort((a, b) => b.mb - a.mb).slice(0, 3).map((r) => r.id) })}
                                style={{ minHeight: 52, borderRadius: 14, background: '#232736', color: '#e8eaf0', fontSize: 16, fontWeight: 600 }}
                              >
                                Select large files
                              </button>

                              <div style={{ height: 1, background: '#2d3144', margin: '6px 0 2px' }} />

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e8eaf0' }}>Recent searches</div>
                                  <div style={{ fontSize: 13, color: '#9aa3b2' }}>
                                    {s.hist.length === 0 ? 'None stored' : `${s.hist.length} search${s.hist.length === 1 ? '' : 'es'}`}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={this.clearRecentSearches}
                                  disabled={s.hist.length === 0}
                                  style={{
                                    minHeight: 48,
                                    borderRadius: 14,
                                    background: s.hist.length === 0
                                      ? '#232736'
                                      : s.histClearedToast
                                      ? '#1c382b'
                                      : '#2a273b',
                                    color: s.hist.length === 0
                                      ? '#646c80'
                                      : s.histClearedToast
                                      ? '#3ecf8e'
                                      : '#ff8a8a',
                                    border: s.hist.length === 0
                                      ? '1px solid transparent'
                                      : s.histClearedToast
                                      ? '1px solid rgba(62, 207, 142, 0.4)'
                                      : '1px solid rgba(255, 110, 110, 0.25)',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    cursor: s.hist.length === 0 ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.18s ease',
                                  }}
                                >
                                  {s.histClearedToast ? (
                                    <>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                      <span>Recent searches cleared</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>
                                      <span>Clear recent searches</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </main>

              {/* In-App Live HTML5 Video Player Modal */}
              {s.playingMedia && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 200,
                    background: 'rgba(0,0,0,.92)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 760,
                      background: '#161822',
                      borderRadius: 24,
                      overflow: 'hidden',
                      boxShadow: '0 24px 64px rgba(0,0,0,.8)',
                      border: '1px solid #2d3144',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #262a3a' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 620 }}>
                        {s.playingMedia.title}
                      </div>
                      <button
                        onClick={() => this.setState({ playingMedia: null, playing: '' })}
                        style={{ width: 36, height: 36, borderRadius: 18, background: '#262a3a', color: '#fff', fontSize: 20 }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ width: '100%', height: 420, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.playingMedia.audio ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 90, height: 90, borderRadius: 45, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M9 18V6l10-2v12" />
                              <circle cx="6.5" cy="18" r="2.5" />
                              <circle cx="16.5" cy="16" r="2.5" />
                            </svg>
                          </div>
                          <audio src={s.playingMedia.url} controls autoPlay style={{ width: 440 }} />
                        </div>
                      ) : (
                        <video
                          src={s.playingMedia.url}
                          controls
                          autoPlay
                          playsInline
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}


              {/* Bottom Transfer Strip / Playing bar */}
              {(active.length > 0 || !!s.playing) && (
                <button
                  onClick={() => (first ? this.setState({ screen: 'down' }) : this.setState({ playing: '', playingMedia: null }))}
                  style={{
                    position: 'absolute',
                    left: 108,
                    right: 108,
                    bottom: 24,
                    minHeight: 68,
                    boxShadow: '0 12px 32px rgba(0,0,0,.5)',
                    padding: '0 20px',
                    borderRadius: 20,
                    background: '#232736',
                    color: '#e8eaf0',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 10,
                    zIndex: 10,
                  }}
                >
                  <span style={{ fontSize: 14 }}>
                    {first
                      ? 'Downloading ' + first.title + ' · ' + first.pct + '%'
                      : 'Now playing: ' + s.playing + ' (tap to stop)'}
                  </span>
                  <span style={{ display: 'block', height: 6, borderRadius: 3, background: '#363c50' }}>
                    <span style={barOf(first ? first.pct : 100)} />
                  </span>
                </button>
              )}

              {/* Left Navigation Rail — pure-web demo only; the native shell
                  renders this rail natively ABOVE every WebView layer. */}
              {!hasNativeShell() && (
              <div
                style={{
                  position: 'absolute',
                  left: 20,
                  top: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  zIndex: 200,
                }}
              >
                <nav style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <button
                    aria-label="Home"
                    onClick={() => {
                      this.goHome()
                    }}
                    style={navStyle(s.screen === 'browse')}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
                    </svg>
                  </button>
                  <button
                    aria-label="Downloads"
                    onClick={() => this.setState({ screen: 'down' })}
                    style={navStyle(s.screen === 'down')}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" />
                    </svg>
                    {dlActive > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          minWidth: 20,
                          height: 20,
                          borderRadius: 10,
                          background: dlFailed ? '#ff7a9c' : '#3ecf8e',
                          color: '#06130d',
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {dlActive}
                      </span>
                    )}
                  </button>
                  <button
                    aria-label="Library"
                    onClick={() => this.setState({ screen: 'lib' })}
                    style={navStyle(s.screen === 'lib')}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="5" width="18" height="14" rx="3" />
                      <path d="M10 9.5v5l4.5-2.5z" />
                    </svg>
                    {libAll.some((r) => r.isNew) && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          background: '#7c5cff',
                          boxShadow: '0 0 0 2px #0e0f14',
                        }}
                      />
                    )}
                  </button>
                </nav>
              </div>
              )}

              {/* Top Navigation Bar Elements (when not in downloads screen) */}
              {s.screen !== 'down' && (
                <>
                  {/* Home / Menu Button */}
                  <button
                    aria-label={isHomeNow ? 'Menu' : 'Home'}
                    onClick={() => {
                      if (isHomeNow) {
                        this.setState({ dw: true })
                        return
                      }
                      if (s.screen !== 'browse') {
                        this.setState({ screen: 'browse' })
                        return
                      }
                      // Mockup homeTap: only load/done start the sweep —
                      // taps mid-sweep (or mid-search) are ignored.
                      const phx = sq?.phase
                      if (!(sq ? phx === 'load' || phx === 'done' : !!s.webviewSrc)) return
                      if (hasNativeShell()) {
                        requestGoBack()
                      }
                      this.setState({
                        seq: sq ? { ...sq, phase: 'rdown' } : { key: 'home', text: '', phase: 'rdown' },
                        sp: 0,
                      })
                    }}
                    style={{
                      position: 'absolute',
                      left: 20,
                      top: 48,
                      width: 60,
                      height: 60,
                      zIndex: 40,
                      background: 'none',
                      color: '#e8eaf0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                      transition: 'transform 0.12s ease',
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)' }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                  >
                    <span style={{ position: 'relative', display: 'block', width: 32, height: 32 }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={hbStyle}>
                        <path d="M4 7h16M4 12h16M4 17h16" />
                      </svg>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" style={hhStyle}>
                        <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
                      </svg>
                    </span>
                  </button>

                  {/* Back / Forward chevrons (<>) */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 86,
                      top: 48,
                      zIndex: 40,
                      display: 'flex',
                      gap: 2,
                    }}
                  >
                    <button
                      aria-label="Back"
                      disabled={!canGoBack}
                      onClick={() => {
                        if (s.screen !== 'browse') {
                          this.setState({ screen: 'browse' })
                          return
                        }
                        // Mockup goBrowse: only load/done act mid-sequence.
                        const phx = sq?.phase
                        const pageActive = sq ? phx === 'load' || phx === 'done' : !!s.webviewSrc
                        if (sq && !pageActive) return
                        const curTab = s.tabs[s.ci]
                        const hist = curTab ? this.tabHistories[curTab.id] : undefined
                        if (pageActive && hist && hist.index > 0) {
                          // Navigate back in this tab's history
                          hist.index -= 1
                          const prevText = hist.stack[hist.index]
                          const target = resolveWebTarget(prevText)
                          if (hasNativeShell()) {
                            requestGoBack()
                            this.suppressNav = true
                          }
                          this.setState({
                            q: prevText,
                            webviewSrc: target.src,
                            webviewUrl: target.url,
                            tabs: s.tabs.map((t, i) => (i === s.ci ? { ...t, text: prevText } : t)),
                            seq: { key: 'restore', text: prevText, phase: 'done', t0: Date.now() },
                            sp: 1,
                          }, this.syncBrowserPane)
                          this.handleVideoDetected(prevText)
                          return
                        }

                        // Otherwise at beginning of tab's history: animate back to Home like the mockup
                        if (!pageActive) return
                        if (hasNativeShell()) {
                          requestGoBack()
                        }
                        this.setState({
                          seq: sq ? { ...sq, phase: 'rdown' } : { key: 'home', text: '', phase: 'rdown' },
                          sp: 0,
                        })
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 40,
                        height: 60,
                        background: 'none',
                        color: canGoBack ? '#e8eaf0' : '#565d70',
                        filter: canGoBack ? 'drop-shadow(0 2px 6px rgba(0,0,0,.8))' : 'none',
                        cursor: canGoBack ? 'pointer' : 'default',
                        transition: 'transform 0.12s ease, color 0.15s ease',
                      }}
                      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)' }}
                      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 5l-7 7 7 7" />
                      </svg>
                    </button>
                    <button
                      aria-label="Forward"
                      disabled={!canGoForward}
                      onClick={() => {
                        if (!canGoForward) return
                        if (s.screen !== 'browse') {
                          this.setState({ screen: 'browse' })
                          return
                        }
                        const phx = sq?.phase
                        if (sq && phx !== 'load' && phx !== 'done') return
                        const curTab = s.tabs[s.ci]
                        const hist = curTab ? this.tabHistories[curTab.id] : undefined
                        if (hist && hist.index < hist.stack.length - 1) {
                          hist.index += 1
                          const nextText = hist.stack[hist.index]
                          const target = resolveWebTarget(nextText)
                          if (hasNativeShell()) {
                            requestGoForward()
                            this.suppressNav = true
                          }
                          this.setState({
                            q: nextText,
                            webviewSrc: target.src,
                            webviewUrl: target.url,
                            tabs: s.tabs.map((t, i) => (i === s.ci ? { ...t, text: nextText } : t)),
                            seq: { key: 'restore', text: nextText, phase: 'done', t0: Date.now() },
                            sp: 1,
                          }, this.syncBrowserPane)
                          this.handleVideoDetected(nextText)
                        } else if (hasNativeShell()) {
                          requestGoForward()
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 40,
                        height: 60,
                        background: 'none',
                        color: canGoForward ? '#e8eaf0' : '#565d70',
                        filter: canGoForward ? 'drop-shadow(0 2px 6px rgba(0,0,0,.8))' : 'none',
                        cursor: canGoForward ? 'pointer' : 'default',
                        transition: 'transform 0.12s ease, color 0.15s ease',
                      }}
                      onMouseDown={(e) => { if (canGoForward) e.currentTarget.style.transform = 'scale(0.92)' }}
                      onMouseUp={(e) => { if (canGoForward) e.currentTarget.style.transform = 'scale(1)' }}
                      onMouseLeave={(e) => { if (canGoForward) e.currentTarget.style.transform = 'scale(1)' }}
                    >
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* Top Right: New Tab & Switcher */}
                  <div style={{ position: 'absolute', right: 20, top: 48, zIndex: 40, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      aria-label="New tab"
                      onClick={newTab}
                      onPointerDown={() => {
                        this.held = false
                        clearTimeout(this.ht)
                        this.ht = setTimeout(() => {
                          this.ht = null
                          const st = this.state
                          if (st.screen === 'browse' && !st.seq && !st.sw && !st.adding && !st.nph) {
                            this.held = true
                            this.setState({ hm: true, tm: false })
                          }
                        }, 450)
                      }}
                      onPointerUp={() => {
                        clearTimeout(this.ht)
                        this.ht = null
                      }}
                      onPointerCancel={() => {
                        clearTimeout(this.ht)
                        this.ht = null
                      }}
                      onPointerLeave={() => {
                        clearTimeout(this.ht)
                        this.ht = null
                      }}
                      style={{
                        width: 60,
                        height: 60,
                        background: 'none',
                        color: '#e8eaf0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity:
                          (allTabs.length >= 10 ? 0.4 : 1) *
                          (s.nph === 'slide' ? Math.max(0, Math.min(1, (s.npp - 0.55) / 0.4)) : 1),
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                      }}
                    >
                      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    <button
                      aria-label="Show tabs"
                      onClick={() => {
                        if (this.held2) {
                          this.held2 = false
                          return
                        }
                        this.setState({ sw: true, swt: 0, swm: s.cpriv, pm: false })
                      }}
                      onPointerDown={() => {
                        this.held2 = false
                        clearTimeout(this.ht2)
                        this.ht2 = setTimeout(() => {
                          this.ht2 = null
                          const st = this.state
                          if (!st.sw && !st.nz && !st.nph && !st.adding && !st.dw) {
                            this.held2 = true
                            this.setState({ tm: true, hm: false })
                          }
                        }, 450)
                      }}
                      onPointerUp={() => {
                        clearTimeout(this.ht2)
                        this.ht2 = null
                      }}
                      onPointerCancel={() => {
                        clearTimeout(this.ht2)
                        this.ht2 = null
                      }}
                      onPointerLeave={() => {
                        clearTimeout(this.ht2)
                        this.ht2 = null
                      }}
                      style={{
                        position: 'relative',
                        width: 60,
                        height: 60,
                        background: 'none',
                        color: '#e8eaf0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                      }}
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                        <rect x="7" y="3" width="14" height="14" rx="3" />
                        <rect x="3" y="7" width="14" height="14" rx="3" fill="#0e0f14" />
                      </svg>
                      <span
                        style={{
                          position: 'absolute',
                          left: 19,
                          top: 25,
                          width: 16,
                          height: 16,
                          lineHeight: '16px',
                          textAlign: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {allTabs.length}
                      </span>
                    </button>
                  </div>

                  {/* Recently Visited Dropdown Menu */}
                  {s.hm && (
                    <>
                      <div onClick={() => this.setState({ hm: false })} style={{ position: 'absolute', inset: 0 }} />
                      <div
                        style={{
                          position: 'absolute',
                          right: 86,
                          top: 116,
                          width: 320,
                          maxWidth: 'calc(100% - 100px)',
                          boxSizing: 'border-box',
                          padding: 10,
                          borderRadius: 22,
                          background: '#1f2230',
                          boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                          opacity: s.hmp,
                          transform: `translateY(${Math.round((1 - s.hmp) * -8)}px) scale(${(0.96 + 0.04 * s.hmp).toFixed(3)})`,
                          transformOrigin: 'top right',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        <div style={{ padding: '6px 12px 8px', fontSize: 13, fontWeight: 600, color: '#9aa3b2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Recently visited</span>
                          {s.hist.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                this.clearRecentSearches()
                              }}
                              style={{ background: 'none', border: 0, color: '#8b94a5', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {s.hist.length === 0 && (
                          <div style={{ padding: '14px 12px', fontSize: 15, color: '#9aa3b2' }}>
                            Nothing visited yet
                          </div>
                        )}
                        {s.hist.map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              if (s.seq) return
                              debugLog(`hist-open "${t}" | tabs=${s.tabs.length} ci=${s.ci}`)
                              this.setState({ hm: false, seq: { key: 'hist:' + t, text: t, phase: 'fade' }, sp: 0, q: t, tabs: this.tabTextPatch(s.tabs, s.ci, t) })
                            }}
                            style={{
                              minHeight: 52,
                              width: '100%',
                              boxSizing: 'border-box',
                              borderRadius: 14,
                              padding: '0 12px',
                              background: 'none',
                              color: '#e8eaf0',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 14,
                              textAlign: 'left',
                              fontSize: 16,
                            }}
                          >
                            <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 1 0 3-6.7" />
                                <path d="M3 4v5h5" />
                                <path d="M12 7v5l3 2" />
                              </svg>
                            </span>
                            <span style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Horizontal Tab Pills Bar (Top + Under layers) */}
                  <div
                    onPointerDown={sDown}
                    onPointerMove={sMove}
                    onPointerUp={sUp}
                    onPointerCancel={sUp}
                    onWheel={sWheel}
                    style={{
                      position: 'absolute',
                      left: 140,
                      top: 36,
                      width: Math.max(200, (s.vw || 820) - 280),
                      height: 110,
                      overflow: 'hidden',
                      touchAction: 'pan-y',
                      cursor: this.dr.sf ? 'grabbing' : 'grab',
                      pointerEvents: s.pa > 0.5 ? 'auto' : 'none',
                      zIndex: 41,
                      maskImage: gT.over ? edge : 'none',
                      WebkitMaskImage: gT.over ? edge : 'none',
                    }}
                  >
                    {pillsTop.map((p, idx) => (
                      <button
                        key={`pt-${idx}`}
                        aria-label={p.title}
                        onPointerDown={(e) => this.handlePillPointerDown(e, idx)}
                        onPointerMove={(e) => this.handlePillPointerMove(e, idx)}
                        onPointerUp={(e) => this.handlePillPointerUp(e, idx, gT.pitch, allTabs.length, p.go)}
                        onPointerCancel={(e) => this.handlePillPointerUp(e, idx, gT.pitch, allTabs.length, p.go)}
                        style={p.style}
                      >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div
                    onPointerDown={sDown}
                    onPointerMove={sMove}
                    onPointerUp={sUp}
                    onPointerCancel={sUp}
                    onWheel={sWheel}
                    style={{
                      position: 'absolute',
                      left: 140,
                      top: 116,
                      width: Math.max(200, (s.vw || 820) - 280),
                      height: 38,
                      overflow: 'hidden',
                      touchAction: 'pan-y',
                      cursor: this.dr.sf ? 'grabbing' : 'grab',
                      pointerEvents: s.pb > 0.5 ? 'auto' : 'none',
                      zIndex: 41,
                      maskImage: gU.over ? edge : 'none',
                      WebkitMaskImage: gU.over ? edge : 'none',
                    }}
                  >
                    {pillsUnder.map((u, idx) => (
                      <button key={`pu-${idx}`} aria-label={u.title} onClick={u.go} style={u.style}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Downloads Screen Header Actions */}
              {s.screen === 'down' && (
                <>
                  <button
                    aria-label="Download history"
                    onClick={() => this.setState({ dh: !s.dh })}
                    style={{
                      position: 'absolute',
                      left: 20,
                      top: 48,
                      width: 60,
                      height: 60,
                      background: 'none',
                      color: '#e8eaf0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 3-6.7" />
                      <path d="M3 4v5h5" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </button>

                  <button
                    aria-label="More"
                    onClick={() => this.setState({ dm: !s.dm, dmc: false })}
                    style={{
                      position: 'absolute',
                      top: 48,
                      width: 60,
                      height: 60,
                      background: 'none',
                      color: '#e8eaf0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                      right: 20,
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                </>
              )}

              {/* Downloads Action Menu (dm) */}
              {s.dm && (
                <>
                  <div onClick={() => this.setState({ dm: false, dmc: false })} style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(8,9,13,.5)' }} />
                  <div
                    style={{
                      position: 'absolute',
                      right: 20,
                      top: 116,
                      zIndex: 6,
                      width: 280,
                      transformOrigin: 'top right',
                      boxSizing: 'border-box',
                      padding: 8,
                      borderRadius: 22,
                      background: '#1f2230',
                      boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <button
                      onClick={() => this.setState({ dp: dlRows.filter((r) => !r.isErr).map((r) => r.title), dm: false })}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
                      </span>
                      Pause all
                    </button>
                    <button
                      onClick={() => this.setState({ dp: [], dm: false })}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                      Resume all
                    </button>
                    <button
                      onClick={() => (s.dmc ? this.setState({ dr: [...s.dr, ...dlRows.map((r) => r.title)], dm: false, dmc: false }) : this.setState({ dmc: true }))}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: s.dmc ? '#ffb3c6' : '#ff8fab' }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: 'rgba(255,122,156,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff7a9c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </span>
                      {s.dmc ? 'Tap again to cancel all' : 'Cancel all'}
                    </button>
                    <button
                      onClick={() => this.setState({ dr: [...s.dr, ...dlRows.filter((r) => r.isErr).map((r) => r.title)], dm: false })}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>
                      </span>
                      Clear failed
                    </button>
                  </div>
                </>
              )}

              {/* Download History Popover (showDh) */}
              {s.screen === 'down' && s.dh && (
                <>
                  <div onClick={() => this.setState({ dh: false })} style={{ position: 'absolute', inset: 0, zIndex: 5 }} />
                  <div
                    style={{
                      position: 'absolute',
                      left: 20,
                      top: 116,
                      zIndex: 6,
                      width: 400,
                      boxSizing: 'border-box',
                      padding: 10,
                      borderRadius: 22,
                      background: '#1f2230',
                      boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 8px 12px' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#9aa3b2' }}>Download history</span>
                      <button onClick={() => this.setState({ dhRows: [], dhc: true }, this.saveStorage)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: 'none', color: '#b7a6ff', fontSize: 15, fontWeight: 600 }}>
                        Clear
                      </button>
                    </div>
                    {s.dhRows.length === 0 && (
                      <div style={{ padding: '14px 12px', fontSize: 15, color: '#9aa3b2' }}>No download history</div>
                    )}
                    {s.dhRows.map((h, idx) => (
                      <div key={idx} style={{ minHeight: 56, boxSizing: 'border-box', borderRadius: 14, padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{h.title}</span>
                        <span style={{ fontSize: 13, color: '#9aa3b2' }}>
                          {h.fmt} · {h.when} · <span style={{ color: h.ink, fontWeight: 600 }}>{h.status}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Library Screen Header Actions */}
              {s.screen === 'lib' && (
                <>
                  {!s.sel ? (
                    <>
                      <button
                        aria-label={cards ? 'Show as list' : 'Show as cards'}
                        onClick={() => this.setState({ lay: cards ? 'list' : 'cards' })}
                        style={{
                          position: 'absolute',
                          top: 48,
                          width: 60,
                          height: 60,
                          background: 'none',
                          color: '#e8eaf0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                          right: 84,
                        }}
                      >
                        {!cards ? (
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                            <rect x="3" y="3" width="8" height="8" rx="2" />
                            <rect x="13" y="3" width="8" height="8" rx="2" />
                            <rect x="3" y="13" width="8" height="8" rx="2" />
                            <rect x="13" y="13" width="8" height="8" rx="2" />
                          </svg>
                        ) : (
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                        )}
                      </button>
                      <button
                        aria-label="More"
                        onClick={() => this.setState({ lm: !s.lm })}
                        style={{
                          position: 'absolute',
                          top: 48,
                          width: 60,
                          height: 60,
                          background: 'none',
                          color: '#e8eaf0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                          right: 20,
                        }}
                      >
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="5" cy="12" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="19" cy="12" r="1.8" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => this.setState({ sel: false, selIds: [], selConf: false })}
                      style={{
                        position: 'absolute',
                        top: 48,
                        background: 'none',
                        color: '#b7a6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                        right: 20,
                        width: 'auto',
                        padding: '0 12px',
                        fontSize: 20,
                        fontWeight: 700,
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </>
              )}

              {/* Library Action Menu (lm) */}
              {s.lm && (
                <>
                  <div onClick={() => this.setState({ lm: false })} style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(8,9,13,.5)' }} />
                  <div
                    style={{
                      position: 'absolute',
                      right: 20,
                      top: 116,
                      zIndex: 6,
                      width: 280,
                      transformOrigin: 'top right',
                      boxSizing: 'border-box',
                      padding: 8,
                      borderRadius: 22,
                      background: '#1f2230',
                      boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <button onClick={() => this.setState({ sel: true, selIds: [], lm: false })} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></svg>
                      </span>
                      Select
                    </button>
                    <button onClick={() => this.setState({ lm: false })} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7" /></svg>
                      </span>
                      Export All
                    </button>
                    <button onClick={() => this.setState({ stOpen: true, lm: false })} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>
                      </span>
                      Storage details
                    </button>
                  </div>
                </>
              )}

              {/* Animated New Tab Glyph Indicator */}
              {!!s.nph && (
                <div style={npStyle}>
                  <svg width={npIc} height={npIc} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flex: 'none' }}>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span style={npLabel}>{this.privNext ? 'Private' : 'New tab'}</span>
                </div>
              )}

              {/* Tab Quick Action Popover Menu (showTm) */}
              {(s.tm || s.tmp > 0) && (
                <>
                  <div onClick={() => this.setState({ tm: false, tmc: false })} style={{ position: 'absolute', inset: 0 }} />
                  <div
                    style={{
                      position: 'absolute',
                      left: 520,
                      top: 116,
                      width: 280,
                      boxSizing: 'border-box',
                      padding: 10,
                      borderRadius: 22,
                      background: '#1f2230',
                      boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                      opacity: s.tmp,
                      transform: `translateY(${Math.round((1 - s.tmp) * -8)}px) scale(${(0.96 + 0.04 * s.tmp).toFixed(3)})`,
                      transformOrigin: '250px 0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <button
                      onClick={() => {
                        this.setState({ tm: false, tmc: false })
                        closeCurrent()
                      }}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16 }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </span>
                      Close this tab
                    </button>
                    <button
                      onClick={() => {
                        if (!s.tmc) {
                          this.setState({ tmc: true })
                          return
                        }
                        this.setState({ tm: false, tmc: false })
                        closeAll()
                      }}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: s.tmc ? 'rgba(255,122,156,.16)' : 'none', color: '#ff7a9c', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16 }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#3d1a26', color: '#ff7a9c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8l8 8M16 8l-8 8" /><rect x="3" y="3" width="18" height="18" rx="5" /></svg>
                      </span>
                      {s.tmc ? 'Tap again to confirm' : 'Close all tabs'}
                    </button>
                    <div style={{ height: 1, margin: '6px 12px', background: '#2d3144' }} />
                    <button
                      onClick={() => {
                        this.setState({ tm: false, tmc: false })
                        this.privNext = true
                        newTab()
                      }}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16 }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4.2 9.5 6a14 14 0 01-2.7 3.3M6.4 7.6A14 14 0 002.5 12c1 1.8 4.5 6 9.5 6a9.8 9.8 0 004-.9" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></svg>
                      </span>
                      New private tab
                    </button>
                  </div>
                </>
              )}

              {/* Floating Download FAB — pure-web demo only; the native shell
                  draws its own draggable magnet FAB above every WebView. */}
              {!hasNativeShell() && s.screen === 'browse' && !s.sw && s.swp === 0 && !s.dw && (
                <button
                  aria-label="Download media"
                  onClick={() => this.setState({ sheet: !s.sheet })}
                  style={{
                    position: 'absolute',
                    right: 24,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: 'linear-gradient(135deg, #8a6cfc, #6c47eb)',
                    border: '1px solid rgba(255, 255, 255, 0.22)',
                    boxShadow: '0 8px 24px rgba(124, 92, 255, 0.45), 0 2px 8px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 42,
                    padding: 0,
                    transition: 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease',
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(-50%) scale(0.92)'
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3v12" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                  {s.detectedVideo && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -2,
                        right: -2,
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        background: '#34d399',
                        border: '2px solid #0e0f14',
                        boxShadow: '0 0 8px #34d399',
                      }}
                    />
                  )}
                </button>
              )}

              {/* Format Selection Bottom Sheet (sheet) */}
              {s.sheet && (
                <>
                  <div
                    className="sheet-backdrop-fade"
                    onClick={() => this.setState({ sheet: false })}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0,0,0,.55)',
                      backdropFilter: 'blur(3px)',
                      WebkitBackdropFilter: 'blur(3px)',
                      zIndex: 99,
                    }}
                  />
                  <aside
                    ref={this.sheetRef}
                    className="sheet-slide-up"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: '32px 32px 0 0',
                      background: '#1f2230',
                      padding: '14px 28px 32px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      zIndex: 100,
                      boxShadow: '0 -16px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08)',
                      animation: 'sheetSlideUp 0.36s cubic-bezier(0.16, 1, 0.3, 1) both',
                      willChange: 'transform, opacity',
                    }}
                  >
                    <div style={{ width: 48, height: 5, borderRadius: 3, background: '#4a5068', alignSelf: 'center' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {s.detectedVideo ? 'Save detected video' : 'Download Video'}
                      </div>
                      <button
                        aria-label="Close"
                        onClick={() => this.setState({ sheet: false })}
                        style={{
                          background: 'none',
                          border: 0,
                          color: '#9aa3b2',
                          fontSize: 26,
                          minWidth: 44,
                          minHeight: 44,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        ×
                      </button>
                    </div>

                    {s.detectedVideo ? (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 600,
                              color: '#f0f2f8',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.detectedVideo.title}
                          </div>
                          {s.detectedVideo.url && (
                            <div
                              style={{
                                fontSize: 13,
                                color: '#9aa3b2',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {s.detectedVideo.url.replace(/^https?:\/\//, '')}
                            </div>
                          )}
                        </div>

                        {fmts.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {fmts.map((f) => (
                              <button
                                key={f.id}
                                onClick={() => this.setState({ fmt: f.id })}
                                style={{
                                  minHeight: 52,
                                  borderRadius: 14,
                                  padding: '0 18px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  color: '#e8eaf0',
                                  background: s.fmt === f.id ? '#2d2a55' : '#232736',
                                  border: `1.5px solid ${s.fmt === f.id ? '#7c5cff' : 'transparent'}`,
                                  boxShadow: s.fmt === f.id ? '0 0 16px rgba(124,92,255,.25)' : 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: 9,
                                      border: `2px solid ${s.fmt === f.id ? '#7c5cff' : '#4a5068'}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {s.fmt === f.id && (
                                      <div style={{ width: 8, height: 8, borderRadius: 4, background: '#7c5cff' }} />
                                    )}
                                  </div>
                                  <span style={{ fontSize: 15, fontWeight: 600 }}>{f.label}</span>
                                </div>
                                <span style={{ fontSize: 13, color: '#9aa3b2' }}>{f.meta}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <button
                          onClick={this.startDownload}
                          style={{
                            marginTop: 4,
                            minHeight: 54,
                            borderRadius: 16,
                            background: '#7c5cff',
                            color: '#fff',
                            fontSize: 16,
                            fontWeight: 700,
                            border: 0,
                            cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(124,92,255,.4)',
                          }}
                        >
                          Start Download
                        </button>
                      </>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '18px 12px 10px',
                          gap: 12,
                          textAlign: 'center',
                        }}
                      >
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 16,
                            background: '#282b3a',
                            color: '#9aa3b2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="10 8 16 12 10 16 10 8" />
                          </svg>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                          No video detected on page
                        </div>
                        <div style={{ fontSize: 14, color: '#9aa3b2', maxWidth: 360, lineHeight: 1.4 }}>
                          Play a video in the browser or search for media to capture downloadable streams automatically.
                        </div>
                        {(s.webviewUrl || s.q) && (
                          <button
                            onClick={() => {
                              const target = s.webviewUrl || s.q
                              if (target) {
                                this.handleVideoDetected(target)
                              }
                            }}
                            style={{
                              marginTop: 6,
                              minHeight: 46,
                              padding: '0 22px',
                              borderRadius: 14,
                              background: '#2e2b4f',
                              border: '1px solid #7c5cff',
                              color: '#c5b7ff',
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Scan current page for video streams
                          </button>
                        )}
                      </div>
                    )}
                  </aside>
                </>
              )}

              {/* Tab Switcher Overlay (showSw) */}
              {(s.sw || s.swp > 0) && (
                <div
                  data-swroot="1"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: s.swm ? 'rgba(23,19,38,.78)' : 'rgba(14,15,20,.6)',
                    backdropFilter: 'blur(22px)',
                    WebkitBackdropFilter: 'blur(22px)',
                    opacity: s.swp,
                    transform: `scale(${0.96 + 0.04 * s.swp})`,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '72px 28px 0',
                    boxSizing: 'border-box',
                    zIndex: 50,
                  }}
                >
                  {s.pm && <div onClick={() => this.setState({ pm: false })} style={{ position: 'absolute', inset: 0, zIndex: 4 }} />}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 32,
                    }}
                  >
                    <div style={{ fontSize: 30, fontWeight: 700, color: s.swm ? '#b7a6ff' : '#e8eaf0' }}>
                      {(s.swm ? 'Private' : 'Tabs') + ' (' + swCount + ')'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button aria-label="New tab" onClick={addFromSw} style={{ width: 60, height: 60, background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                      {(s.cpriv || s.tabs.some((t) => t.priv)) && (
                        <div style={{ position: 'relative' }}>
                          <button
                            aria-label="Switch between tabs and private"
                            onClick={() => this.setState({ pm: !s.pm })}
                            style={{
                              minHeight: 56,
                              padding: '0 16px 0 20px',
                              borderRadius: 28,
                              background: s.swm ? '#2d2a55' : '#232736',
                              color: s.swm ? '#b7a6ff' : '#e8eaf0',
                              fontSize: 19,
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            {s.swm ? 'Private' : 'Tabs'}
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                          {s.pm && (
                            <div
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: 64,
                                width: 300,
                                boxSizing: 'border-box',
                                padding: 8,
                                borderRadius: 20,
                                background: '#1f2230',
                                boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                                opacity: s.pmp,
                                transform: `translateY(${Math.round((1 - s.pmp) * -6)}px) scale(${(0.96 + 0.04 * s.pmp).toFixed(3)})`,
                                transformOrigin: '80% 0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                              }}
                            >
                              <button
                                onClick={() => this.setState({ swm: false, pm: false, swt: 0 })}
                                style={{
                                  minHeight: 48,
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  borderRadius: 14,
                                  padding: '0 14px',
                                  background: s.swm ? 'none' : '#2d2a55',
                                  color: '#e8eaf0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  textAlign: 'left',
                                  fontSize: 16,
                                  fontWeight: 600,
                                }}
                              >
                                <span style={{ flex: 1 }}>{s.swm ? 'Go back to Tabs' : 'Tabs'}</span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#9aa3b2' }}>
                                  {s.tabs.filter((t) => !t.priv).length + (s.cpriv ? 0 : 1)}
                                </span>
                              </button>
                              <button
                                onClick={() => this.setState({ swm: true, pm: false, swt: 0 })}
                                style={{
                                  minHeight: 48,
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  borderRadius: 14,
                                  padding: '0 14px',
                                  background: s.swm ? '#2d2a55' : 'none',
                                  color: '#e8eaf0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  textAlign: 'left',
                                  fontSize: 16,
                                  fontWeight: 600,
                                }}
                              >
                                <span style={{ flex: 1 }}>{s.swm ? 'Stay in Private' : 'Private'}</span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#9aa3b2' }}>
                                  {s.tabs.filter((t) => t.priv).length + (s.cpriv ? 1 : 0)}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <button onClick={closeSw} style={{ minHeight: 60, padding: '0 16px', background: 'none', color: '#b7a6ff', fontSize: 22, fontWeight: 700 }}>
                        Done
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    <div onScroll={onSc('sw')} style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingBottom: 24 }}>
                      <div style={{ position: 'relative', width: Math.round(736 * swk), maxWidth: '100%', margin: '0 auto', height: gridH }}>
                        {tabView.map((t) => (
                          <div key={t.id} style={t.slotStyle}>
                            <div style={t.pop}>
                              {t.isNew ? (
                                <button
                                  aria-label="New tab"
                                  onClick={t.open}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '100%',
                                    height: Math.round(480 * swk),
                                    boxSizing: 'border-box',
                                    background: 'none',
                                    color: '#b7a6ff',
                                    fontSize: Math.round(96 * swk),
                                    fontWeight: 300,
                                    border: '2px dashed #4a5068',
                                    borderRadius: 20,
                                  }}
                                >
                                  +
                                </button>
                              ) : (
                                <div style={{ display: t.dsp }}>
                                  <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#181a22' }}>
                                    <button aria-label={t.title} onClick={t.open} style={{ display: 'block', width: '100%', height: Math.round(480 * swk), padding: 0, background: 'linear-gradient(135deg,#34304f,#1a1c27)' }} />
                                    <div style={{ position: 'absolute', inset: 0, borderRadius: 20, pointerEvents: 'none', boxShadow: t.ring }} />
                                    {t.canClose && (
                                      <button aria-label="Close tab" onClick={t.close} style={{ position: 'absolute', top: 8, right: 8, width: 44, height: 44, borderRadius: 22, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 22 }}>
                                        ×
                                      </button>
                                    )}
                                  </div>
                                  <div style={{ height: 48, boxSizing: 'border-box', padding: '10px 4px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t.title}</div>
                                      <div style={{ fontSize: 13, color: '#9aa3b2' }}>{t.sub}</div>
                                    </div>
                                    {vis.length > 1 && (
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none', marginLeft: 8 }}>
                                        <button
                                          type="button"
                                          title="Move tab earlier"
                                          aria-label="Move tab earlier"
                                          disabled={!t.canMoveLeft}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            t.moveLeft?.()
                                          }}
                                          style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 16,
                                            background: t.canMoveLeft ? '#25293a' : '#1a1c26',
                                            border: '1px solid #363c52',
                                            color: t.canMoveLeft ? '#e8eaf0' : '#4e556b',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: t.canMoveLeft ? 'pointer' : 'not-allowed',
                                            fontSize: 14,
                                            transition: 'all 0.15s ease',
                                          }}
                                        >
                                          ←
                                        </button>
                                        <button
                                          type="button"
                                          title="Move tab later"
                                          aria-label="Move tab later"
                                          disabled={!t.canMoveRight}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            t.moveRight?.()
                                          }}
                                          style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 16,
                                            background: t.canMoveRight ? '#25293a' : '#1a1c26',
                                            border: '1px solid #363c52',
                                            color: t.canMoveRight ? '#e8eaf0' : '#4e556b',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: t.canMoveRight ? 'pointer' : 'not-allowed',
                                            fontSize: 14,
                                            transition: 'all 0.15s ease',
                                          }}
                                        >
                                          →
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={thumb('sw')} />
                  </div>
                </div>
              )}

              {/* Side Menu Drawer (dw) */}
              {(s.dw || s.dwp > 0) && (
                <>
                  <div onClick={() => this.setState({ dw: false })} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', opacity: s.dwp, zIndex: 60 }} />
                  <aside
                    aria-label="Menu"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 340,
                      boxSizing: 'border-box',
                      padding: '28px 20px',
                      background: '#161821',
                      boxShadow: '0 0 60px rgba(0,0,0,.6)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      zIndex: 61,
                      ...dwStyle,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 11, background: '#7c5cff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ borderLeft: '12px solid #fff', borderTop: '7px solid transparent', borderBottom: '7px solid transparent', marginLeft: 3 }} />
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>Menu</div>
                      </div>
                      <button aria-label="Close menu" onClick={() => this.setState({ dw: false })} style={{ width: 44, height: 44, borderRadius: 22, background: '#232736', color: '#e8eaf0', fontSize: 22 }}>
                        ×
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        this.setState({ dw: false, cpriv: !s.cpriv })
                      }}
                      style={{ minHeight: 60, width: '100%', boxSizing: 'border-box', borderRadius: 16, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', fontSize: 17, fontWeight: 600 }}
                    >
                      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4.2 9.5 6a14 14 0 01-2.7 3.3M6.4 7.6A14 14 0 002.5 12c1 1.8 4.5 6 9.5 6a9.8 9.8 0 004-.9" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></svg>
                      </span>
                      {s.cpriv ? 'Exit Private Mode' : 'Private'}
                    </button>

                    <button
                      onClick={() => this.setState({ dw: false, stOpen: true })}
                      style={{ minHeight: 60, width: '100%', boxSizing: 'border-box', borderRadius: 16, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', fontSize: 17, fontWeight: 600 }}
                    >
                      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
                      </span>
                      Settings &amp; Storage
                    </button>

                    <button
                      type="button"
                      onClick={() => this.clearRecentSearches()}
                      disabled={s.hist.length === 0}
                      style={{
                        minHeight: 60,
                        width: '100%',
                        boxSizing: 'border-box',
                        borderRadius: 16,
                        padding: '0 12px',
                        background: 'none',
                        color: s.hist.length === 0 ? '#636c80' : (s.histClearedToast ? '#3ecf8e' : '#e8eaf0'),
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        textAlign: 'left',
                        fontSize: 17,
                        fontWeight: 600,
                        cursor: s.hist.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: s.hist.length === 0 ? 0.6 : 1,
                      }}
                    >
                      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: s.histClearedToast ? '#1c382b' : '#2d2a55', color: s.histClearedToast ? '#3ecf8e' : '#ff8a8a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {s.histClearedToast ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>
                        )}
                      </span>
                      {s.histClearedToast ? 'Recent Searches Cleared' : `Clear Recent Searches${s.hist.length > 0 ? ` (${s.hist.length})` : ''}`}
                    </button>

                    <button
                      onClick={() => this.setState({ dw: false })}
                      style={{ minHeight: 60, width: '100%', boxSizing: 'border-box', borderRadius: 16, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', fontSize: 17, fontWeight: 600 }}
                    >
                      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 010 18z" fill="currentColor" /></svg>
                      </span>
                      Theme
                    </button>
                  </aside>
                </>
              )}

              {/* Animated Zoom New Tab View */}
              {s.nz && (
                <div style={nzStyle}>
                  <span style={{ opacity: Number(Math.max(0, 1 - nzz * 2.5).toFixed(2)), lineHeight: 1 }}>+</span>
                </div>
              )}

              {/* Add Favorite Modal */}
              {(s.adding || s.mp > 0) && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}>
                  <div onClick={() => this.setState({ adding: false })} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.65)', opacity: s.mp }} />
                  <div
                    role="dialog"
                    aria-label="Add a favorite"
                    style={{
                      position: 'relative',
                      width: 520,
                      boxSizing: 'border-box',
                      padding: 28,
                      borderRadius: 28,
                      background: '#1f2230',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      boxShadow: '0 24px 80px rgba(0,0,0,.6)',
                      opacity: s.mp,
                      transform: `scale(${0.9 + 0.1 * (1 - Math.pow(1 - s.mp, 3))})`,
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 700 }}>Add a favorite</div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#9aa3b2' }}>
                      Name
                      <input
                        type="text"
                        placeholder="Optional"
                        onInput={(e: any) => { this.nm = e.target.value }}
                        style={{
                          height: 52,
                          boxSizing: 'border-box',
                          borderRadius: 14,
                          border: 0,
                          background: '#2a2e3f',
                          color: '#e8eaf0',
                          fontSize: 16,
                          fontFamily: 'inherit',
                          padding: '0 16px',
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#9aa3b2' }}>
                      Site address
                      <input
                        type="text"
                        placeholder="e.g. vimeo.com"
                        onInput={(e: any) => { this.ad = e.target.value }}
                        style={{
                          height: 52,
                          boxSizing: 'border-box',
                          borderRadius: 14,
                          border: 0,
                          background: '#2a2e3f',
                          color: '#e8eaf0',
                          fontSize: 16,
                          fontFamily: 'inherit',
                          padding: '0 16px',
                        }}
                      />
                    </label>
                    <div style={{ fontSize: 13, color: '#9aa3b2' }}>Icon color</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {PALETTE.map((c, i) => (
                        <button
                          key={c.name}
                          aria-label={c.name}
                          onClick={() => this.setState({ pick: i })}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 14,
                            background: c.bg,
                            boxShadow: `inset 0 0 0 3px ${s.pick === i ? c.ink : 'transparent'}`,
                            border: 0,
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        onClick={() => this.setState({ adding: false })}
                        style={{ minHeight: 48, padding: '0 22px', borderRadius: 14, background: '#2a2e3f', color: '#e8eaf0', fontSize: 15 }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const clean = (this.ad || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
                          const label = ((this.nm || '').trim() || clean).slice(0, 14)
                          const dup = s.favs.some((f) => f.label.toLowerCase() === label.toLowerCase())
                          if (!label || dup) {
                            this.setState({ adding: false })
                            return
                          }
                          const c = PALETTE[s.pick]
                          this.pending = { url: clean || label, label, letter: label.charAt(0).toUpperCase(), bg: c.bg, ink: c.ink }
                          this.hold = true
                          this.setState({ adding: false })
                        }}
                        style={{ minHeight: 48, padding: '0 28px', borderRadius: 14, background: '#7c5cff', color: '#fff', fontSize: 15, fontWeight: 600 }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
}
