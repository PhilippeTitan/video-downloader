import type { DownloadJob } from '../types'
import type { HistoryEntry } from '../history'

/**
 * Downloads screen — mockup section (Main.dc.html 90–104): plain 26/700
 * heading, one-line empty state, and job cards (96×64 thumb, "title · format"
 * left / status right, green progress bar). Controls (pause/cancel/history
 * menus) are parked until the features discussion.
 */

export interface DownloadsScreenProps {
  jobs: DownloadJob[]
  history: HistoryEntry[]
  freeBytes: number | null
  onGoHome: () => void
  onGoLibrary: (jobId: string) => void
  onCancel: (id: string) => void
  onRemove: (id: string) => void
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRetry: (id: string) => void
  onUseCellular: (id: string) => void
  onPauseAll: () => void
  onResumeAll: () => void
  onCancelAll: () => void
  onClearFailed: () => void
  onPlay: (job: DownloadJob) => void
  onClearHistory: () => void
}

const ACTIVE = new Set(['downloading', 'queued', 'paused', 'converting', 'error'])

function pctOf(job: DownloadJob): number {
  if (job.status === 'converting' || job.status === 'complete' || job.status === 'error') return 100
  if (!job.totalBytes || job.totalBytes <= 0) return 0
  return Math.min(100, Math.round((job.receivedBytes / job.totalBytes) * 100))
}

function statusOf(job: DownloadJob): string {
  switch (job.status) {
    case 'complete':
      return 'Complete'
    case 'error':
      return 'Failed'
    case 'converting':
      return 'Remuxing'
    case 'paused':
      return 'Paused'
    case 'queued':
      return job.waitingForWifi ? 'Waiting for Wi-Fi' : 'Queued'
    default:
      return `${pctOf(job)}%`
  }
}

export function DownloadsScreen({ jobs }: DownloadsScreenProps) {
  const list = jobs.filter((job) => ACTIVE.has(job.status))

  return (
    <div className="dl">
      <div className="dl__scroller">
        <div className="dl__inner">
          <h1 className="stub__title">Downloads</h1>

          {list.length === 0 && (
            <p className="stub__empty">
              Nothing in progress. Open a page with a video and tap the purple card.
            </p>
          )}

          <div className="stub__list">
            {list.map((job) => (
              <article className="jobcard" key={job.id}>
                <span className="jobcard__thumb" aria-hidden="true" />
                <span className="jobcard__body">
                  <span className="jobcard__row">
                    <span className="jobcard__title">
                      {job.title} · {job.formatLabel}
                    </span>
                    <span className="jobcard__status">{statusOf(job)}</span>
                  </span>
                  <span className="jobcard__track">
                    <span className="jobcard__fill" style={{ width: `${pctOf(job)}%` }} />
                  </span>
                </span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
