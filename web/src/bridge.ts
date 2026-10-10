/**
 * Contract between the native iOS shell and this web UI.
 *
 * The shell embeds this app in a WKWebView layered ABOVE a browsing
 * WKWebView (chrome-over-content). Scripts injected into the browsing view
 * report anything downloadable - page URLs, .m3u8 HLS manifests, direct
 * media files - by posting a message INTO this view:
 *
 *   window.postMessage(
 *     { source: 'vd-native', type: 'detect', payload: { url, kind, title, tabId } },
 *     '*',
 *   )
 */

export type DetectionKind = 'hls' | 'video' | 'page'

export interface DetectionEvent {
  /** Absolute URL of the detected source (manifest, media file or page). */
  url: string
  kind: DetectionKind
  /** Optional page/video title for display. */
  title?: string
  /** Per-tab detection scope (Q046). */
  tabId?: string
}

interface NativeEnvelope {
  source: 'vd-native'
  type: string
  payload: unknown
}

function isNativeEnvelope(data: unknown): data is NativeEnvelope {
  if (typeof data !== 'object' || data === null) return false
  const envelope = data as Partial<NativeEnvelope>
  return envelope.source === 'vd-native' && typeof envelope.type === 'string'
}

/** Subscribe to detection messages from the native shell. Returns unsubscribe. */
export function onDetection(handler: (event: DetectionEvent) => void): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    if (isNativeEnvelope(event.data) && event.data.type === 'detect') {
      const payload = event.data.payload as DetectionEvent | undefined
      if (payload?.url) handler(payload)
    }
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export interface NavStateEvent {
  /** Index of the browsing tab this state belongs to (web tab order). */
  tabIndex: number
  url: string
  title?: string
  canGoBack: boolean
  canGoForward: boolean
}

/** Subscribe to browsing-WebView navigation state (back/forward enablement
 *  + live URL/title per tab). Returns unsubscribe. */
export function onNavState(handler: (event: NavStateEvent) => void): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    if (isNativeEnvelope(event.data) && event.data.type === 'navState') {
      const payload = event.data.payload as NavStateEvent | undefined
      if (payload && typeof payload.tabIndex === 'number') handler(payload)
    }
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

/* ------------------------------------------------------------------ *
 * UI -> Shell Bridge Messages
 * ------------------------------------------------------------------ */

interface VkHandler {
  postMessage(message: unknown): void
}

interface ShellWindow {
  webkit?: { messageHandlers?: { vd?: Partial<VkHandler> } }
}

interface RnWindow {
  ReactNativeWebView?: { postMessage?: (message: string) => void }
}

function shellHandler(): VkHandler | null {
  const handler = (window as ShellWindow).webkit?.messageHandlers?.vd
  if (handler && typeof handler.postMessage === 'function') return handler as VkHandler
  // Expo Go (react-native-webview): same envelope, JSON string over the wire.
  const rn = (window as RnWindow).ReactNativeWebView
  if (rn && typeof rn.postMessage === 'function') {
    return { postMessage: (message: unknown) => rn.postMessage!(JSON.stringify(message)) }
  }
  return null
}

/** True when running inside the iOS shell (its WKScriptMessageHandler exists). */
export function hasNativeShell(): boolean {
  return shellHandler() !== null
}

/** Send an action message to the native shell. */
export function sendNativeAction(type: string, payload?: unknown): boolean {
  const handler = shellHandler()
  if (!handler) return false
  handler.postMessage({ source: 'vd-ui', type, payload })
  return true
}

/** Ask the shell's browsing WebView to load a URL. */
export function requestNavigation(url: string): boolean {
  return sendNativeAction('navigate', { url })
}

/** Ask the shell to switch the active browsing tab (Q010, Q046).
 *  Index order mirrors the web tab list (web is the source of truth). */
export function requestSwitchTab(index: number): boolean {
  return sendNativeAction('switchTab', { index })
}

/** Ask the shell to close a tab by index (Q016). */
export function requestCloseTab(index: number): boolean {
  return sendNativeAction('closeTab', { index })
}

/** Ask the shell to open a new empty tab. */
export function requestNewTab(): boolean {
  return sendNativeAction('newTab')
}

/** Push the full web tab list (source of truth) to the shell so its browsing
 *  WebView mirror can't drift after UI reloads / fast refresh. */
export function requestSyncTabs(
  tabs: { id: string; url: string; title?: string }[],
  activeIndex: number,
): boolean {
  return sendNativeAction('syncTabs', { tabs, activeIndex })
}

/** Ask the shell to reload the active browsing tab (Q058 refresh). */
export function requestReload(): boolean {
  return sendNativeAction('reload')
}

/** Ask the shell to go back in the active browsing tab's history. */
export function requestGoBack(): boolean {
  return sendNativeAction('goBack')
}

/** Ask the shell to go forward in the active browsing tab's history. */
export function requestGoForward(): boolean {
  return sendNativeAction('goForward')
}

/** Page-load lifecycle of the active browsing tab (drives the sequence's
 *  load -> done gate: the page is revealed once it has loaded). */
export interface PageLoadEvent {
  tabIndex: number
  state: 'start' | 'end' | 'error'
  url?: string
  message?: string
}

/** Subscribe to browsing-WebView page-load events. Returns unsubscribe. */
export function onPageLoad(handler: (event: PageLoadEvent) => void): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    if (isNativeEnvelope(event.data) && event.data.type === 'pageLoad') {
      const payload = event.data.payload as PageLoadEvent | undefined
      if (payload && typeof payload.tabIndex === 'number') handler(payload)
    }
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

export interface BrowserPaneRect {
  x: number
  y: number
  w: number
  h: number
  /** false = positioned but invisible (page loads hidden); true = revealed. */
  visible: boolean
}

/** Place the browsing WebView INSIDE the app layout at this rect (the
 *  `.browser-slot` box). With `visible: false` it loads hidden; with
 *  `visible: true` the shell reveals it (fade + short slide). Pass null to
 *  hide the browser entirely (home / idle: only the UI is visible). */
export function requestBrowserPane(rect: BrowserPaneRect | null): boolean {
  return sendNativeAction('browserPane', rect ?? undefined)
}

/** Trigger iOS system share sheet for a completed file (Q042). */
export function requestShareFile(filePath: string, title?: string): boolean {
  return sendNativeAction('shareFile', { filePath, title })
}

/** Clear web browsing cookies, storage, and cache in the native shell (Q055). */
export function requestClearBrowsingData(): boolean {
  return sendNativeAction('clearBrowsingData')
}

/** Trigger export of all completed files via system share sheet (Q070). */
export function requestExportAll(): boolean {
  return sendNativeAction('exportAll')
}
