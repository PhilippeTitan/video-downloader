import type { DownloadJob, JobStatus } from './types'

/**
 * Download history log (D009): completed, failed and canceled jobs —
 * title, format, date, status. Last 100 kept, Clear button in the UI.
 */

export interface HistoryEntry {
  /** Stable key: one entry per job per terminal outcome. */
  key: string
  jobId: string
  title: string
  fmt: string
  at: number
  status: 'Completed' | 'Failed' | 'Canceled'
  url?: string
}

const STORAGE_KEY = 'vd-history-v1'
const MAX_ENTRIES = 100

function statusLabel(status: JobStatus): HistoryEntry['status'] | null {
  if (status === 'complete') return 'Completed'
  if (status === 'error') return 'Failed'
  if (status === 'canceled') return 'Canceled'
  return null
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    /* quota */
  }
}

export function clearHistory() {
  saveHistory([])
}

/**
 * Idempotent: makes sure every terminal job has exactly one history entry.
 * Called on every job refresh, so completions that happened while the app
 * was suspended still land in the log (D048 rehydration path).
 */
export function syncHistory(jobs: DownloadJob[]): HistoryEntry[] {
  const entries = loadHistory()
  const known = new Set(entries.map((e) => e.key))
  let changed = false

  for (const job of jobs) {
    const label = statusLabel(job.status)
    if (!label) continue
    const key = `${job.id}:${label}`
    if (known.has(key)) continue
    known.add(key)
    entries.unshift({
      key,
      jobId: job.id,
      title: job.title,
      fmt: job.formatLabel,
      at: job.completedAt ?? job.createdAt,
      status: label,
      url: job.url,
    })
    changed = true
  }

  if (changed) saveHistory(entries)
  return changed ? entries.slice(0, MAX_ENTRIES) : entries
}

/** "Today" / "Yesterday" / "06 Oct" for history + library subtitles. */
export function whenLabel(at: number): string {
  const date = new Date(at)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (at >= startOfToday) return 'Today'
  if (at >= startOfToday - 86_400_000) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
