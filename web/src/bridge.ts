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

/* ------------------------------------------------------------------ *
 * UI -> Shell Bridge Messages
 * ------------------------------------------------------------------ */

interface VkHandler {
  postMessage(message: unknown): void
}

interface ShellWindow {
  webkit?: { messageHandlers?: { vd?: Partial<VkHandler> } }
}

function shellHandler(): VkHandler | null {
  const handler = (window as ShellWindow).webkit?.messageHandlers?.vd
  return handler && typeof handler.postMessage === 'function'
    ? (handler as VkHandler)
    : null
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

/** Ask the shell to reload the active browsing tab (Q058 refresh). */
export function requestReload(): boolean {
  return sendNativeAction('reload')
}

export interface BrowserPaneRect {
  x: number
  y: number
  w: number
  h: number
}

/** Frame the browsing WebView INSIDE the chrome: lift it above the UI to
 *  this rect of the viewport (Safari-style content pane), or pass null to
 *  drop it back fullscreen behind the chrome. */
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
