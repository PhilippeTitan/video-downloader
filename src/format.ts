import type { Format } from './types'

/** Small display helpers shared across the UI. */

/** 3725 -> "1:02:05"; 125 -> "2:05" */
export function formatDuration(totalSeconds: number | undefined): string {
  if (totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--'
  const secs = Math.round(totalSeconds)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** 1536000 -> "1.5 MB" */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '--'
  if (bytes < 1000) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1000
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** Bytes per second -> "3.4 MB/s" */
export function formatSpeed(bytesPerSecond: number | undefined): string {
  if (bytesPerSecond === undefined || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return ''
  return `${formatBytes(bytesPerSecond)}/s`
}

/** Seconds -> "2m 10s" */
export function formatEta(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return ''
  const secs = Math.round(seconds)
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** Video formats first (best quality first), audio tracks at the end. */
export function sortFormats(formats: Format[]): Format[] {
  return [...formats].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'video' ? -1 : 1
    const heightDiff = (b.height ?? 0) - (a.height ?? 0)
    if (heightDiff !== 0) return heightDiff
    return (b.bitrateKbps ?? 0) - (a.bitrateKbps ?? 0)
  })
}

/** Short quality label: "1080p" for video, "128 kbps" for audio. */
export function resolutionLabel(format: Format): string {
  if (format.kind === 'audio') {
    return format.bitrateKbps ? `${format.bitrateKbps} kbps` : 'Audio'
  }
  return format.height ? `${format.height}p` : 'Video'
}

/** The format selected by default after an analysis. */
export function defaultFormatId(formats: Format[]): string | undefined {
  return sortFormats(formats)[0]?.id
}

/** Best-effort "does this look like a link we can hand to the backend".
 * Bare domains like "youtube.com/watch?v=x" count - the scheme is optional. */
export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || /\s/.test(trimmed)) return false
  try {
    const parsed = new URL(normalizeUrl(trimmed))
    return parsed.hostname.includes('.')
  } catch {
    return false
  }
}

/** Trim + default to https:// so "youtube.com" works like a full URL. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** What the address bar submit should load: the URL itself, or a YouTube
 * search for free-form text ("funny cats" -> the results page). */
export function toNavigationTarget(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (looksLikeUrl(trimmed)) return normalizeUrl(trimmed)
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmed)}`
}
