import { useEffect, useMemo, useRef, useState } from 'react'
import type { DownloadJob } from '../types'
import type { HistoryEntry } from '../history'
import { whenLabel } from '../history'
import { formatBytes, formatEta, formatSpeed } from '../format'
import {
  AlertIcon,
  CloseIcon,
  ClockIcon,
  DotsIcon,
  DownloadIcon,
  MusicIcon,
  PauseIcon,
  PlaySolidIcon,
} from '../components/Icons'

/**
 * Downloads screen — port of the canvas design (file3) implementing
 * D001–D010, D033, D035, D036, D007, D008, D045 (light colors via tokens).
 *
 * D002 grouping: downloading/remuxing → waiting/queued → failed,
 * newest first within each group. Completed jobs linger ~5s as a green
 * "Saved · Play" row before sliding over to Library (D005).
 */

const LINGER_MS = 5000
const LOW_STORAGE_BYTES = 1024 * 1024 * 1024

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

type GroupKey = 'running' | 'waiting' | 'failed'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function detailFor(job: DownloadJob): string {
  const source = `Source: ${hostOf(job.url)}`
  const stage = `Stage: ${job.stage ?? (job.status === 'converting' ? 'remuxing' : job.status)}`
  if (job.status === 'error') {
    return `${source} · ${stage} · URL: ${job.url}`
  }
  const file = `File: ${job.title}.${job.ext}`
  const speed = job.speedBps ? ` · Speed: ${formatSpeed(job.speedBps)}` : ''
  return `${source} · Format: ${job.formatLabel} · ${file} · ${stage}${speed}`
}

function metaFor(job: DownloadJob): string {
  const parts: string[] = []
  if (job.totalBytes) {
    parts.push(`${formatBytes(job.receivedBytes)} of ${formatBytes(job.totalBytes)}`)
  } else if (job.receivedBytes > 0) {
    parts.push(formatBytes(job.receivedBytes))
  }
  const speed = formatSpeed(job.speedBps)
  if (speed) parts.push(speed)
  if (job.totalBytes && job.speedBps) {
    const eta = formatEta((job.totalBytes - job.receivedBytes) / job.speedBps)
    if (eta) parts.push(`${eta} left`)
  }
  return parts.join(' · ')
}

function pctOf(job: DownloadJob): number {
  if (job.status === 'converting' || job.status === 'complete') return 100
  if (job.status === 'error') return 100
  if (!job.totalBytes || job.totalBytes <= 0) return 0
  return Math.min(100, Math.round((job.receivedBytes / job.totalBytes) * 100))
}

interface RowView {
  job: DownloadJob
  kind: 'running' | 'waiting' | 'failed' | 'saved'
}

export function DownloadsScreen(props: DownloadsScreenProps) {
  const {
    jobs,
    history,
    freeBytes,
    onGoHome,
    onGoLibrary,
    onCancel,
    onRemove,
    onPause,
    onResume,
    onRetry,
    onUseCellular,
    onPauseAll,
    onResumeAll,
    onCancelAll,
    onClearFailed,
    onPlay,
    onClearHistory,
  } = props

  const [menuOpen, setMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [cancelArmed, setCancelArmed] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const armedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (armedTimer.current) clearTimeout(armedTimer.current) }, [])

  const armCancelAll = () => {
    if (cancelArmed) {
      if (armedTimer.current) clearTimeout(armedTimer.current)
      setCancelArmed(false)
      onCancelAll()
      setMenuOpen(false)
      return
    }
    setCancelArmed(true)
    if (armedTimer.current) clearTimeout(armedTimer.current)
    armedTimer.current = setTimeout(() => setCancelArmed(false), 3000)
  }

  const rows = useMemo<RowView[]>(() => {
    const now = Date.now()
    const views: RowView[] = []
    for (const job of jobs) {
      if (job.status === 'downloading' || job.status === 'converting') {
        views.push({ job, kind: 'running' })
      } else if (
        job.status === 'complete' &&
        job.completedAt &&
        now - job.completedAt < LINGER_MS
      ) {
        views.push({ job, kind: 'saved' })
      } else if (job.status === 'queued' || job.status === 'paused') {
        views.push({ job, kind: 'waiting' })
      } else if (job.status === 'error') {
        views.push({ job, kind: 'failed' })
      }
    }
    const order: Record<GroupKey, number> = { running: 0, waiting: 1, failed: 2 }
    // "saved" rides with running; newest first within each group (D002).
    return views.sort((a, b) => {
      const ga = a.kind === 'saved' ? 0 : order[a.kind as GroupKey]
      const gb = b.kind === 'saved' ? 0 : order[b.kind as GroupKey]
      if (ga !== gb) return ga - gb
      return (b.job.completedAt ?? b.job.createdAt) - (a.job.completedAt ?? a.job.createdAt)
    })
  }, [jobs])

  const running = rows.filter((r) => r.kind === 'running')
  const activeCount = running.length
  const failedCount = jobs.filter((j) => j.status === 'error').length
  const totalSpeed = running.reduce((sum, r) => sum + (r.job.speedBps ?? 0), 0)
  const subtitle =
    activeCount > 0
      ? `${activeCount} active · ${totalSpeed > 0 ? formatSpeed(totalSpeed) : 'starting…'}`
      : 'idle'
  const lowStorage = freeBytes !== null && freeBytes < LOW_STORAGE_BYTES

  const closePopovers = () => {
    setMenuOpen(false)
    setHistoryOpen(false)
    setCancelArmed(false)
    if (armedTimer.current) clearTimeout(armedTimer.current)
  }

  return (
    <div className="dl">
      <button
        type="button"
        className="screen-fab screen-fab--left"
        aria-label="Download history"
        aria-expanded={historyOpen}
        onClick={() => {
          setMenuOpen(false)
          setHistoryOpen((v) => !v)
        }}
      >
        <ClockIcon width={30} height={30} />
      </button>
      <button
        type="button"
        className="screen-fab screen-fab--right"
        aria-label="More"
        aria-expanded={menuOpen}
        onClick={() => {
          setHistoryOpen(false)
          setMenuOpen((v) => !v)
        }}
      >
        <DotsIcon width={26} height={26} />
      </button>

      {(menuOpen || historyOpen) && (
        <button
          type="button"
          className="menu__catch"
          aria-label="Close menu"
          onClick={closePopovers}
        />
      )}

      {menuOpen && (
        <div className="menu menu--right" role="menu">
          <button type="button" className="menu__item" role="menuitem" onClick={() => { onPauseAll(); setMenuOpen(false) }}>
            <span className="menu__icon"><PauseIcon width={18} height={18} /></span>
            Pause all
          </button>
          <button type="button" className="menu__item" role="menuitem" onClick={() => { onResumeAll(); setMenuOpen(false) }}>
            <span className="menu__icon"><PlaySolidIcon width={18} height={18} /></span>
            Resume all
          </button>
          <button
            type="button"
            className={`menu__item${cancelArmed ? ' menu__item--danger' : ''}`}
            role="menuitem"
            onClick={armCancelAll}
          >
            <span className="menu__icon menu__icon--danger">
              <CloseIcon width={18} height={18} />
            </span>
            {cancelArmed ? 'Tap again to cancel all' : 'Cancel all'}
          </button>
          <button type="button" className="menu__item" role="menuitem" onClick={() => { onClearFailed(); setMenuOpen(false) }}>
            <span className="menu__icon menu__icon--danger">
              <AlertIcon width={18} height={18} />
            </span>
            Clear failed{failedCount > 0 ? ` (${failedCount})` : ''}
          </button>
        </div>
      )}

      {historyOpen && (
        <div className="menu menu--left menu--wide" role="dialog" aria-label="Download history">
          <div className="menu__head">
            <span className="menu__title">Download history</span>
            <button
              type="button"
              className="menu__action"
              onClick={() => {
                onClearHistory()
              }}
            >
              Clear
            </button>
          </div>
          {history.length === 0 ? (
            <div className="menu__empty">No download history</div>
          ) : (
            history.slice(0, 50).map((entry) => {
              const job = jobs.find((j) => j.id === entry.jobId)
              const fileGone = entry.status === 'Completed' && (!job || job.fileMissing)
              const ink =
                entry.status === 'Completed'
                  ? 'ok'
                  : entry.status === 'Failed'
                    ? 'err'
                    : 'muted'
              return (
                <button
                  type="button"
                  key={entry.key}
                  className={`menu__hrow${fileGone ? ' menu__hrow--gone' : ''}`}
                  disabled={fileGone}
                  onClick={() => {
                    if (fileGone) return
                    setHistoryOpen(false)
                    if (entry.status === 'Completed') onGoLibrary(entry.jobId)
                    else if (entry.status === 'Failed') onRetry(entry.jobId)
                  }}
                >
                  <span className="menu__hrow-title">{entry.title}</span>
                  <span className="menu__hrow-sub">
                    {entry.fmt} · {whenLabel(entry.at)} ·{' '}
                    <span className={`menu__hrow-status menu__hrow-status--${ink}`}>
                      {fileGone ? 'File deleted' : entry.status}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}

      <div className="dl__scroller">
        <div className="dl__inner">
          <header className="shead">
            <span className="shead__mark"><DownloadIcon width={20} height={20} /></span>
            <h1 className="shead__title">Downloads</h1>
            <p className="shead__sub">{subtitle}</p>
          </header>

          {lowStorage && (
            <div className="dl__banner" role="status">
              <AlertIcon width={22} height={22} />
              <span>
                Low storage: {formatBytes(freeBytes ?? 0)} free. New downloads will ask before
                starting.
              </span>
            </div>
          )}

          {rows.length === 0 && (
            <div className="empty">
              <span className="empty__mark"><DownloadIcon width={20} height={20} /></span>
              <p className="empty__text">
                No active downloads. Open a page with a video and tap the purple card.
              </p>
              <button type="button" className="empty__btn" onClick={onGoHome}>
                Go to Home
              </button>
            </div>
          )}

          <div className="dl__rows">
            {rows.map(({ job, kind }, i) => {
              const pct = pctOf(job)
              const isRemux = job.status === 'converting'
              const isPaused = job.status === 'paused'
              const isWaiting = kind === 'waiting'
              const isFailed = kind === 'failed'
              const isSaved = kind === 'saved'
              const canPause = job.status === 'downloading' || job.status === 'queued'
              const isOpen = expanded === job.id
              const indeterminate = job.status === 'downloading' && !job.totalBytes

              const sub = isFailed
                ? 'Failed'
                : isSaved
                  ? 'Saved · Play'
                  : isRemux
                    ? 'Remuxing'
                    : isPaused
                      ? 'Paused'
                      : job.waitingForWifi
                        ? 'Waiting for Wi-Fi'
                        : job.status === 'queued'
                          ? 'Queued'
                          : 'Downloading'
              const meta = metaFor(job)
              const showBar = kind !== 'saved' && kind !== 'failed'

              return (
                <div
                  className={`dlrow dlrow--${isSaved ? 'saved' : isFailed ? 'failed' : isRemux ? 'remux' : isWaiting ? 'waiting' : 'running'}${isOpen ? ' dlrow--open' : ''}`}
                  key={job.id}
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                >
                  <div className="dlrow__card">
                    <div className="dlrow__top">
                      <button
                        type="button"
                        className="dlrow__main"
                        aria-label={isSaved ? 'Play' : 'Details'}
                        aria-expanded={isSaved ? undefined : isOpen}
                        onClick={() => (isSaved ? onPlay(job) : setExpanded(isOpen ? null : job.id))}
                      >
                        <span
                          className="dlrow__ring"
                          style={{ background: `conic-gradient(var(--row-color) ${pct}%, var(--dl-track) 0)` }}
                        >
                          <span className="dlrow__thumb">
                            {job.thumbnailUrl ? (
                              <img className="dlrow__img" src={job.thumbnailUrl} alt="" />
                            ) : job.formatId.startsWith('a-') || job.ext === 'm4a' ? (
                              <MusicIcon width={24} height={24} className="dlrow__glyph" />
                            ) : (
                              <PlaySolidIcon width={24} height={24} className="dlrow__glyph" />
                            )}
                          </span>
                        </span>
                        <span className="dlrow__info">
                          <span className="dlrow__title">{job.title}</span>
                          <span className="dlrow__sub">{sub}</span>
                        </span>
                      </button>

                      {canPause && (
                        <button
                          type="button"
                          className="dlrow__ctrl"
                          aria-label="Pause"
                          onClick={() => onPause(job.id)}
                        >
                          <PauseIcon width={20} height={20} />
                        </button>
                      )}
                      {isPaused && (
                        <button
                          type="button"
                          className="dlrow__ctrl"
                          aria-label="Resume"
                          onClick={() => onResume(job.id)}
                        >
                          <PlaySolidIcon width={20} height={20} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="dlrow__ctrl"
                        aria-label={isFailed ? 'Remove from list' : 'Cancel download'}
                        onClick={() => {
                          if (isFailed) onRemove(job.id)
                          else if (isSaved) onRemove(job.id)
                          else onCancel(job.id)
                        }}
                      >
                        <CloseIcon width={20} height={20} />
                      </button>
                    </div>

                    {showBar && (
                      <div className="dlrow__barwrap">
                        <div className="dlrow__bar">
                          <div
                            className={`dlrow__fill${isRemux ? ' dlrow__fill--shimmer' : ''}${indeterminate ? ' dlrow__fill--indeterminate' : ''}`}
                            style={indeterminate ? undefined : { width: `${pct}%` }}
                          />
                        </div>
                        {meta && <div className="dlrow__meta">{meta}</div>}
                      </div>
                    )}

                    {job.waitingForWifi && (
                      <div className="dlrow__rowbtns">
                        <button
                          type="button"
                          className="dlrow__cellular"
                          onClick={() => onUseCellular(job.id)}
                        >
                          Use cellular
                        </button>
                      </div>
                    )}

                    {isFailed && (
                      <div className="dlrow__err">
                        <div className="dlrow__errmsg">{job.error || 'The download failed.'}</div>
                        <div className="dlrow__actions">
                          <button type="button" className="dlrow__btn dlrow__btn--primary" onClick={() => onRetry(job.id)}>
                            Retry
                          </button>
                          <button
                            type="button"
                            className="dlrow__btn"
                            onClick={() => setExpanded(isOpen ? null : job.id)}
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    )}

                    {isOpen && <div className="dlrow__detail">{detailFor(job)}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
