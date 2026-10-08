import { useMemo } from 'react'
import { formatBytes } from '../format'
import type { DownloadJob } from '../types'
import { AlertIcon, CheckIcon, FilmIcon, LibraryIcon, PlayIcon, ShareIcon, TrashIcon } from './Icons'

interface LibraryPanelProps {
  jobs: DownloadJob[]
  onRemove: (id: string) => void
  onClear: () => void
  onPlay?: (job: DownloadJob) => void
  onShare?: (job: DownloadJob) => void
  title?: string
}

function statusNote(job: DownloadJob): string | null {
  switch (job.status) {
    case 'complete':
      return null
    case 'error':
      return job.error ?? 'Failed'
    case 'canceled':
      return 'Canceled'
    case 'queued':
      return 'Queued'
    default:
      return 'Incomplete'
  }
}

function when(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

export function LibraryPanel({
  jobs,
  onRemove,
  onClear,
  onPlay,
  onShare,
  title = 'Downloaded',
}: LibraryPanelProps) {
  // Q098: Newest-first default sort order
  const sortedJobs = useMemo(() => {
    return [...jobs].sort(
      (a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt),
    )
  }, [jobs])

  // Q044: Storage usage indicator (total size + count on header)
  const totalBytes = useMemo(() => {
    return jobs.reduce((sum, j) => sum + (j.receivedBytes || 0), 0)
  }, [jobs])

  const handleRemove = (job: DownloadJob) => {
    // Q045: Delete confirmation dialog for finished files
    if (job.status === 'complete') {
      if (!window.confirm(`Delete "${job.title}"? This cannot be undone.`)) {
        return
      }
    }
    onRemove(job.id)
  }

  const handleShare = (job: DownloadJob) => {
    if (onShare) {
      onShare(job)
    } else if (navigator.share) {
      navigator.share({
        title: job.title,
        url: job.filePath || job.url,
      }).catch(() => {})
    }
  }

  return (
    <section className="card">
      <div className="card__head">
        <div>
          <h3 className="card__title">
            {title}
            {jobs.length > 0 && <span className="badge badge--dim">{jobs.length}</span>}
          </h3>
          {/* Q044: Storage metric display */}
          {jobs.length > 0 && (
            <p className="card__subtitle">
              {formatBytes(totalBytes)} stored in {jobs.length} {jobs.length === 1 ? 'file' : 'files'}
            </p>
          )}
        </div>
        {jobs.length > 0 && (
          <button type="button" className="btn btn--tiny" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="empty">
          <LibraryIcon width={22} height={22} />
          <p>No downloads yet</p>
          <span>Finished downloads show up here.</span>
        </div>
      ) : (
        <ul className="library">
          {sortedJobs.map((job) => {
            const note = statusNote(job)
            const isComplete = job.status === 'complete'

            return (
              <li key={job.id} className="library__row">
                <span className={`library__state library__state--${job.status}`}>
                  {isComplete ? (
                    <CheckIcon width={15} height={15} />
                  ) : job.status === 'error' ? (
                    <AlertIcon width={15} height={15} />
                  ) : (
                    <FilmIcon width={15} height={15} />
                  )}
                </span>
                <div
                  className={`library__text ${isComplete && onPlay ? 'library__text--clickable' : ''}`}
                  onClick={() => isComplete && onPlay && onPlay(job)}
                >
                  <p className="library__title" title={job.filePath ?? job.title}>
                    {job.title}
                  </p>
                  <p className="library__sub">
                    {job.formatLabel} · {formatBytes(job.receivedBytes)}
                    {note ? ` · ${note}` : ''} · {when(job.completedAt ?? job.createdAt)}
                  </p>
                </div>

                <div className="library__actions">
                  {/* Q041: In-app player play trigger */}
                  {isComplete && onPlay && (
                    <button
                      type="button"
                      className="btn btn--icon btn--primary-soft"
                      aria-label="Play file"
                      title="Play file"
                      onClick={() => onPlay(job)}
                    >
                      <PlayIcon width={15} height={15} />
                    </button>
                  )}

                  {/* Q042: Share sheet export */}
                  {isComplete && (
                    <button
                      type="button"
                      className="btn btn--icon"
                      aria-label="Export via Share Sheet"
                      title="Share / Export"
                      onClick={() => handleShare(job)}
                    >
                      <ShareIcon width={15} height={15} />
                    </button>
                  )}

                  {/* Q045: Delete with confirmation */}
                  <button
                    type="button"
                    className="btn btn--icon"
                    aria-label="Delete"
                    title="Delete"
                    onClick={() => handleRemove(job)}
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
