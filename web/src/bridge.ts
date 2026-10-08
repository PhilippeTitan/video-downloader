/**
 * Contract between the native iOS shell and this web UI.
 *
 * The shell embeds this app in a WKWebView layered ABOVE a browsing
 * WKWebView (chrome-over-content). Scripts injected into the browsing view
 * report anything downloadable - page URLs, .m3u8 HLS manifests, direct
 * media files - by posting a message INTO this view:
 *
 *   window.postMessage(
 *     { source: 'vd-native', type: 'detect', payload: { url, kind, title } },
 *     '*',
 *   )
 *
 * The UI reacts by opening like a search: the bar flies up, the download
 * pill fades in, and the source sheet shows what was found.
 *
 * The shell should send each distinct source at most once per page load
 * (debounce/network sniffing lives on the native side).
 *
 * Navigation flows the OTHER way (see requestNavigation below): submitting
 * the address bar asks the shell's browsing WebView to load a URL.
 */

export type DetectionKind = 'hls' | 'video' | 'page'

export interface DetectionEvent {
  /** Absolute URL of the detected source (manifest, media file or page). */
  url: string
  kind: DetectionKind
  /** Optional page/video title for display. */
  title?: string
}

interface NativeEnvelope {
  source: 'vd-native'
  type: 'detect'
  payload: DetectionEvent
}

function isNativeEnvelope(data: unknown): data is NativeEnvelope {
  if (typeof data !== 'object' || data === null) return false
  const envelope = data as Partial<NativeEnvelope>
  if (envelope.source !== 'vd-native' || envelope.type !== 'detect') return false
  const payload = envelope.payload as DetectionEvent | undefined
  return typeof payload?.url === 'string' && payload.url.length > 0
}

/** Subscribe to detection messages from the native shell. Returns unsubscribe. */
export function onDetection(handler: (event: DetectionEvent) => void): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    if (isNativeEnvelope(event.data)) handler(event.data.payload)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

/* ------------------------------------------------------------------ *
 * Navigation: UI -> shell
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

/**
 * Ask the shell's browsing WebView to load a URL. The shell receives:
 *   { source: 'vd-ui', type: 'navigate', payload: { url } }
 * Returns false when there is no shell (dev browser) so the caller can
 * fall back to opening the page in a regular tab.
 */
export function requestNavigation(url: string): boolean {
  const handler = shellHandler()
  if (!handler) return false
  handler.postMessage({ source: 'vd-ui', type: 'navigate', payload: { url } })
  return true
}
