import type { DownloadJob } from '../types'

/**
 * Library screen — mockup section (Main.dc.html 105–122): plain 26/700
 * heading, one-line empty state, two-up card grid (150px thumb, title,
 * format, Play button). Search/filters/menus are parked until the features
 * discussion.
 */

export interface LibraryScreenProps {
  jobs: DownloadJob[]
  freeBytes: number | null
  pulseJobId: string | null
  onGoHome: () => void
  onPlay: (job: DownloadJob) => void
  onShare: (job: DownloadJob) => void
  onDelete: (id: string) => void
  onExportAll: () => void
  onOpenSource: (url: string) => void
}

export function LibraryScreen({ jobs, onPlay }: LibraryScreenProps) {
  const files = jobs
    .filter((job) => job.status === 'complete')
    .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))

  return (
    <div className="lib">
      <div className="lib__scroller">
        <div className="lib__inner">
          <h1 className="stub__title">Library</h1>

          {files.length === 0 && (
            <p className="stub__empty">Finished downloads land here, ready to play.</p>
          )}

          <div className="libstub__grid">
            {files.map((job) => (
              <article className="libcard" key={job.id}>
                <span className="libcard__thumb" aria-hidden="true" />
                <div className="libcard__body">
                  <div className="libcard__title">{job.title}</div>
                  <div className="libcard__fmt">{job.formatLabel}</div>
                  <button type="button" className="libcard__play" onClick={() => onPlay(job)}>
                    Play
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
