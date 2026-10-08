import { formatBytes } from '../format'
import type { DownloadJob } from '../types'
import { AlertIcon, CheckIcon, FilmIcon, LibraryIcon, TrashIcon } from './Icons'

interface LibraryPanelProps {
  jobs: DownloadJob[]
  onRemove: (id: string) => void
  onClear: () => void
  title?: string
}

/** Completed rows need no status word; anything else has to say why it stopped. */
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
  title = 'Downloaded',
}: LibraryPanelProps) {
  return (
    <section className="card">
      <div className="card__head">
        <h3 className="card__title">
          {title}
          {jobs.length > 0 && <span className="badge badge--dim">{jobs.length}</span>}
        </h3>
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
          {jobs.map((job) => {
            const note = statusNote(job)
            return (
              <li key={job.id} className="library__row">
                <span className={`library__state library__state--${job.status}`}>
                  {job.status === 'complete' ? (
                    <CheckIcon width={15} height={15} />
                  ) : job.status === 'error' ? (
                    <AlertIcon width={15} height={15} />
                  ) : (
                    <FilmIcon width={15} height={15} />
                  )}
                </span>
                <div className="library__text">
                  <p className="library__title" title={job.filePath ?? job.title}>
                    {job.title}
                  </p>
                  <p className="library__sub">
                    {job.formatLabel} · {formatBytes(job.receivedBytes)}
                    {note ? ` · ${note}` : ''} · {when(job.completedAt ?? job.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--icon"
                  aria-label="Remove from list"
                  title="Remove from list"
                  onClick={() => onRemove(job.id)}
                >
                  <TrashIcon width={16} height={16} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
