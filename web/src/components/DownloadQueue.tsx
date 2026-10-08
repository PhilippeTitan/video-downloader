import { clamp01, formatBytes, formatEta, formatSpeed } from '../format'
import type { DownloadJob } from '../types'
import { AlertIcon, CloseIcon, DownloadIcon, SpinnerIcon } from './Icons'

interface DownloadQueueProps {
  jobs: DownloadJob[]
  onCancel: (id: string) => void
  onRemove: (id: string) => void
}

const STATUS_TEXT: Record<DownloadJob['status'], string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  converting: 'Remuxing',
  complete: 'Done',
  error: 'Failed',
  canceled: 'Canceled',
}

export function DownloadQueue({ jobs, onCancel, onRemove }: DownloadQueueProps) {
  return (
    <section className="card">
      <div className="card__head">
        <h3 className="card__title">
          Downloads
          {jobs.length > 0 && <span className="badge">{jobs.length}</span>}
        </h3>
      </div>

      {jobs.length === 0 ? (
        <div className="empty">
          <DownloadIcon width={22} height={22} />
          <p>No active downloads</p>
          <span>Start one from the Home tab; finished files move to Downloaded.</span>
        </div>
      ) : (
        <ul className="jobs">
          {jobs.map((job) => {
            const total = job.totalBytes
            const progress =
              job.status === 'converting' || job.status === 'complete'
                ? 1
                : total
                  ? clamp01(job.receivedBytes / total)
                  : undefined
            const stalled = job.status === 'downloading' && !job.speedBps

            return (
              <li key={job.id} className={`job job--${job.status}`}>
                <div className="job__head">
                  <div className="job__ident">
                    <span className="job__state">
                      {job.status === 'error' ? (
                        <AlertIcon width={16} height={16} />
                      ) : job.status === 'complete' ? (
                        <DownloadIcon width={16} height={16} />
                      ) : (
                        <SpinnerIcon className="spin" width={16} height={16} />
                      )}
                    </span>
                    <div className="job__text">
                      <p className="job__title" title={job.title}>
                        {job.title}
                      </p>
                      <p className="job__sub">
                        {STATUS_TEXT[job.status]}
                        <span className="dot" />
                        {job.formatLabel} · {job.ext.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--icon"
                    aria-label="Remove from list"
                    title="Remove from list"
                    onClick={() => onRemove(job.id)}
                  >
                    <CloseIcon width={16} height={16} />
                  </button>
                </div>

                {job.status !== 'error' && job.status !== 'canceled' && (
                  <div
                    className="progress"
                    role="progressbar"
                    aria-valuenow={progress === undefined ? undefined : Math.round(progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`progress__bar${progress === undefined ? ' progress__bar--indeterminate' : ''}`}
                      style={progress === undefined ? undefined : { width: `${progress * 100}%` }}
                    />
                  </div>
                )}

                {job.status === 'error' && job.error && <p className="job__error">{job.error}</p>}

                <div className="job__foot">
                  <span className="job__stats">
                    {job.status === 'downloading' && (
                      <>
                        {formatBytes(job.receivedBytes)}
                        {total ? ` / ${formatBytes(total)}` : ''}
                        {job.speedBps ? ` · ${formatSpeed(job.speedBps)}` : ''}
                        {stalled ? ' · stalled' : ''}
                        {job.etaSec ? ` · ${formatEta(job.etaSec)} left` : ''}
                      </>
                    )}
                    {job.status === 'converting' && 'Assembling final file…'}
                    {job.status === 'complete' && `${formatBytes(job.receivedBytes)} · saved`}
                    {job.status === 'queued' && 'Waiting for a free slot'}
                    {job.status === 'canceled' && 'Canceled'}
                    {job.status === 'error' && 'Download failed'}
                  </span>
                  {(job.status === 'downloading' || job.status === 'queued') && (
                    <button type="button" className="btn btn--tiny" onClick={() => onCancel(job.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
