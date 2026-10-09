import { useEffect, useMemo, useRef, useState } from 'react'
import type { DownloadJob } from '../types'
import { formatBytes, formatDuration } from '../format'
import { whenLabel } from '../history'
import {
  DotsIcon,
  DownloadIcon,
  GridIcon,
  InfoIcon,
  ListIcon,
  MusicIcon,
  PlaySolidIcon,
  SearchIcon,
  SelectIcon,
  ShareIcon,
  StorageIcon,
  TrashIcon,
  VideoIcon,
} from '../components/Icons'

/**
 * Library screen — port of the canvas design (file3) implementing
 * D011–D020, D024, D026–D028, D038–D040, D044.
 *
 * List + cards layouts (switchable, persisted), filter chips, live search,
 * Recent strip, press-and-hold dropdown menu, inline delete confirm,
 * per-file info sheet, storage sheet, multi-select mode.
 */

const AUDIO_EXTS = new Set(['m4a', 'mp3', 'aac', 'opus', 'wav', 'flac'])
const LAYOUT_KEY = 'vd-lib-layout-v1'

interface LibFile {
  job: DownloadJob
  audio: boolean
  isNew: boolean
  mb: number
}

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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function isAudioExt(ext: string): boolean {
  return AUDIO_EXTS.has(ext.toLowerCase())
}

function loadLayout(): 'list' | 'cards' {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved === 'list' || saved === 'cards') return saved
  } catch {
    /* ignore */
  }
  return typeof window !== 'undefined' && window.matchMedia('(orientation: landscape)').matches
    ? 'cards'
    : 'list'
}

type Sheet = { kind: 'info'; job: DownloadJob } | { kind: 'storage' } | null

export function LibraryScreen(props: LibraryScreenProps) {
  const { jobs, freeBytes, pulseJobId, onGoHome, onPlay, onShare, onDelete, onExportAll, onOpenSource } =
    props

  const [layout, setLayout] = useState<'list' | 'cards'>(loadLayout)
  const [chip, setChip] = useState<'all' | 'video' | 'audio'>('all')
  const [query, setQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirmFor, setConfirmFor] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [pulse, setPulse] = useState<string | null>(pulseJobId)

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heldRow = useRef<string | null>(null)
  const menuCatchRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setPulse(pulseJobId)
    if (!pulseJobId) return
    const t = setTimeout(() => setPulse(null), 2600)
    return () => clearTimeout(t)
  }, [pulseJobId])

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, layout)
    } catch {
      /* ignore */
    }
  }, [layout])

  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current) }, [])

  const files = useMemo<LibFile[]>(() => {
    return jobs
      .filter((j) => j.status === 'complete')
      .sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt))
      .map((job) => ({
        job,
        audio: isAudioExt(job.ext),
        isNew: !job.playedAt,
        mb: Math.round((job.receivedBytes || 0) / 1_000_000),
      }))
  }, [jobs])

  const totalBytes = files.reduce((sum, f) => sum + (f.job.receivedBytes || 0), 0)
  const sizeLabel = totalBytes >= 1_024_000_000
    ? `${(totalBytes / 1_024_000_000).toFixed(1)} GB`
    : `${Math.max(1, Math.round(totalBytes / 1_000_000))} MB`
  const freeLabel = freeBytes !== null ? ` · ${formatBytes(freeBytes)} free` : ''
  const subtitle = files.length > 0 ? `${sizeLabel} in ${files.length} files${freeLabel}` : 'Nothing saved yet'

  const q = query.trim().toLowerCase()
  const filtered = files.filter((f) => {
    if (chip === 'video' && f.audio) return false
    if (chip === 'audio' && !f.audio) return false
    if (q && !f.job.title.toLowerCase().includes(q)) return false
    return true
  })

  const showRecent = chip === 'all' && !q && files.length > 0
  const recent = files.filter((f) => !f.job.isPrivate).slice(0, 6)
  const isCards = layout === 'cards'

  const closeAll = () => {
    setMenuFor(null)
    setMoreOpen(false)
    setConfirmFor(null)
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }

  const startHold = (id: string) => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    heldRow.current = null
    holdTimer.current = setTimeout(() => {
      heldRow.current = id
      setMenuFor(id)
      setMoreOpen(false)
      setConfirmFor(null)
    }, 520)
  }
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  const tapRow = (f: LibFile) => {
    if (heldRow.current === f.job.id) {
      heldRow.current = null
      return
    }
    if (selecting) {
      togglePick(f.job.id)
      return
    }
    onPlay(f.job)
  }

  const togglePick = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const openMenu = (id: string) => {
    if (heldRow.current === id) {
      heldRow.current = null
      return
    }
    setMenuFor((prev) => (prev === id ? null : id))
    setMoreOpen(false)
    setConfirmFor(null)
  }

  const startSelect = (id?: string) => {
    setSelecting(true)
    setPicked(id ? [id] : [])
    setMenuFor(null)
    setMoreOpen(false)
    setBulkConfirm(false)
  }

  const endSelect = () => {
    setSelecting(false)
    setPicked([])
    setBulkConfirm(false)
  }

  const shareJobs = (list: DownloadJob[]) => {
    for (const job of list) onShare(job)
  }

  const storage = (() => {
    const audioBytes = files.filter((f) => f.audio).reduce((s, f) => s + (f.job.receivedBytes || 0), 0)
    const videoBytes = totalBytes - audioBytes
    const free = freeBytes ?? 0
    const denom = Math.max(1, totalBytes + free)
    return {
      videoPct: `${Math.max(2, (videoBytes / denom) * 100)}%`,
      audioPct: `${Math.max(2, (audioBytes / denom) * 100)}%`,
      video: formatBytes(videoBytes),
      audio: formatBytes(audioBytes),
      free: freeBytes !== null ? formatBytes(free) : '—',
      largest: [...files].sort((a, b) => b.mb - a.mb).slice(0, 5),
    }
  })()

  const infoJob = sheet?.kind === 'info' ? sheet.job : null

  return (
    <div className={`lib${selecting ? ' lib--selecting' : ''}`}>
      {!selecting ? (
        <>
          <button
            type="button"
            className="screen-fab screen-fab--right screen-fab--offset"
            aria-label={isCards ? 'Switch to list' : 'Switch to cards'}
            onClick={() => setLayout(isCards ? 'list' : 'cards')}
          >
            {isCards ? <ListIcon width={28} height={28} /> : <GridIcon width={28} height={28} />}
          </button>
          <button
            type="button"
            className="screen-fab screen-fab--right"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => {
              setMenuFor(null)
              setMoreOpen((v) => !v)
            }}
          >
            <DotsIcon width={26} height={26} />
          </button>
        </>
      ) : (
        <button type="button" className="screen-fab screen-fab--right screen-fab--text" onClick={endSelect}>
          Cancel
        </button>
      )}

      {(moreOpen || menuFor) && (
        <button type="button" className="menu__catch" aria-label="Close menu" onClick={closeAll} ref={menuCatchRef} />
      )}

      {moreOpen && (
        <div className="menu menu--right" role="menu">
          <button type="button" className="menu__item" role="menuitem" onClick={() => startSelect()}>
            <span className="menu__icon"><SelectIcon width={18} height={18} /></span>
            Select
          </button>
          <button type="button" className="menu__item" role="menuitem" onClick={() => { onExportAll(); setMoreOpen(false) }}>
            <span className="menu__icon"><ShareIcon width={18} height={18} /></span>
            Export All
          </button>
          <button type="button" className="menu__item" role="menuitem" onClick={() => { setSheet({ kind: 'storage' }); setMoreOpen(false) }}>
            <span className="menu__icon"><StorageIcon width={18} height={18} /></span>
            Storage details
          </button>
        </div>
      )}

      <div className="lib__scroller">
        <div className="lib__inner" style={isCards ? { maxWidth: 1100 } : undefined}>
          <header className="shead">
            <span className="shead__mark"><DownloadIcon width={20} height={20} /></span>
            <h1 className="shead__title">Library</h1>
            <p className="shead__sub">{subtitle}</p>
          </header>

          <div className="lib__chips" role="tablist" aria-label="Filter">
            {(['all', 'video', 'audio'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={chip === c}
                className={`lib__chip${chip === c ? ' lib__chip--active' : ''}`}
                onClick={() => setChip(c)}
              >
                {c === 'all' ? 'All' : c === 'video' ? 'Video' : 'Audio'}
              </button>
            ))}
          </div>

          <div className="lib__search">
            <SearchIcon width={22} height={22} className="lib__search-icon" />
            <input
              type="text"
              aria-label="Search Library"
              placeholder="Search Library"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {showRecent && recent.length > 0 && (
            <section className="recent">
              <div className="recent__label">Recently added</div>
              <div className="recent__strip">
                {recent.map((f) => (
                  <button
                    type="button"
                    key={f.job.id}
                    className="recent__card"
                    onClick={() => onPlay(f.job)}
                  >
                    <span className="recent__thumb">
                      {f.job.thumbnailUrl ? (
                        <img src={f.job.thumbnailUrl} alt="" />
                      ) : f.audio ? (
                        <MusicIcon width={26} height={26} />
                      ) : (
                        <VideoIcon width={26} height={26} />
                      )}
                    </span>
                    <span className="recent__title">{f.job.title}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {files.length === 0 && (
            <div className="empty">
              <span className="empty__mark"><DownloadIcon width={20} height={20} /></span>
              <p className="empty__text">Finished downloads land here, ready to play.</p>
              <div className="empty__hint">
                1. Open a page with a video
                <br />
                2. Tap the purple card
                <br />
                3. Pick a format
              </div>
              <button type="button" className="empty__btn" onClick={onGoHome}>
                Go to Home
              </button>
            </div>
          )}

          {files.length > 0 && filtered.length === 0 && (
            <div className="empty">
              <span className="empty__mark"><SearchIcon width={20} height={20} /></span>
              <p className="empty__text">No matches for that search.</p>
            </div>
          )}

          <div className={`lib__grid${isCards ? ' lib__grid--cards' : ''}`}>
            {filtered.map((f, i) => {
              const { job } = f
              const isMenu = menuFor === job.id
              const isConfirm = confirmFor === job.id
              const isPicked = picked.includes(job.id)
              const dim = job.fileMissing ? ' librow--missing' : ''
              const pulsed = pulse === job.id ? ' librow--pulse' : ''
              const sub = job.fileMissing
                ? 'File missing'
                : `${job.formatLabel} · ${formatBytes(job.receivedBytes)} · ${whenLabel(job.completedAt ?? job.createdAt)}${job.isPrivate ? ' · Private' : ''}`

              return (
                <div
                  key={job.id}
                  className={`librow${isMenu ? ' librow--menu' : ''}${dim}${pulsed}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                >
                  {isConfirm ? (
                    <div className="librow__confirm">
                      <span className="librow__confirm-text">Delete this file? This can't be undone.</span>
                      <button type="button" className="librow__confirm-btn" onClick={() => setConfirmFor(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="librow__confirm-btn librow__confirm-btn--danger"
                        onClick={() => {
                          setConfirmFor(null)
                          onDelete(job.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : isCards ? (
                    <div className="libcard">
                      <div className="libcard__glyph">
                        {f.audio ? <MusicIcon width={56} height={56} /> : <VideoIcon width={56} height={56} />}
                      </div>
                      <button
                        type="button"
                        className="libcard__tap"
                        aria-label={job.title}
                        onClick={() => tapRow(f)}
                        onPointerDown={() => startHold(job.id)}
                        onPointerUp={cancelHold}
                        onPointerLeave={cancelHold}
                        onPointerCancel={cancelHold}
                      >
                        <div className="libcard__scrim">
                          <div className="libcard__titleline">
                            <span className="libcard__title">{job.title}</span>
                            {f.isNew && !job.fileMissing && <span className="librow__new" />}
                            {job.isPrivate && <span className="librow__priv">Private</span>}
                          </div>
                          {!job.fileMissing && (
                            <div className="libcard__sub">{sub}</div>
                          )}
                        </div>
                      </button>
                      {job.fileMissing && <span className="libcard__missing">File missing</span>}
                      {selecting && (
                        <button
                          type="button"
                          className={`librow__pick${isPicked ? ' librow__pick--on' : ''}`}
                          aria-label="Select"
                          aria-pressed={isPicked}
                          onClick={() => togglePick(job.id)}
                        >
                          {isPicked && <span />}
                        </button>
                      )}
                      {!selecting && (
                        <button
                          type="button"
                          className="libcard__more"
                          aria-label="More"
                          onClick={() => openMenu(job.id)}
                          onPointerDown={() => startHold(job.id)}
                          onPointerUp={cancelHold}
                          onPointerLeave={cancelHold}
                        >
                          <DotsIcon width={20} height={20} />
                        </button>
                      )}
                      {!selecting && (job.playbackProgress ?? 0) > 0 && (
                        <div className="librow__prog">
                          <div style={{ width: `${Math.min(100, (job.playbackProgress ?? 0) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="liblist">
                      <button
                        type="button"
                        className="liblist__main"
                        aria-label={job.title}
                        onClick={() => tapRow(f)}
                        onPointerDown={() => startHold(job.id)}
                        onPointerUp={cancelHold}
                        onPointerLeave={cancelHold}
                        onPointerCancel={cancelHold}
                      >
                        <span className="liblist__thumb">
                          {job.thumbnailUrl ? (
                            <img src={job.thumbnailUrl} alt="" />
                          ) : f.audio ? (
                            <MusicIcon width={26} height={26} />
                          ) : (
                            <VideoIcon width={26} height={26} />
                          )}
                          {selecting && (
                            <span className={`librow__pick librow__pick--float${isPicked ? ' librow__pick--on' : ''}`}>
                              {isPicked && <span />}
                            </span>
                          )}
                          {(job.playbackProgress ?? 0) > 0 && !job.fileMissing && (
                            <span className="librow__prog librow__prog--float">
                              <span style={{ width: `${Math.min(100, (job.playbackProgress ?? 0) * 100)}%` }} />
                            </span>
                          )}
                        </span>
                        <span className="liblist__info">
                          <span className="liblist__titleline">
                            <span className="liblist__title">{job.title}</span>
                            {f.isNew && !job.fileMissing && <span className="librow__new" />}
                            {job.isPrivate && <span className="librow__priv">Private</span>}
                          </span>
                          <span className={`liblist__sub${job.fileMissing ? ' liblist__sub--missing' : ''}`}>
                            {sub}
                          </span>
                        </span>
                      </button>
                      {!selecting && (
                        <button
                          type="button"
                          className="liblist__more"
                          aria-label="More"
                          onClick={() => openMenu(job.id)}
                        >
                          <DotsIcon width={20} height={20} />
                        </button>
                      )}
                      {selecting && job.fileMissing && (
                        <button type="button" className="liblist__remove" onClick={() => onDelete(job.id)}>
                          Remove
                        </button>
                      )}
                    </div>
                  )}

                  {isMenu && (
                    <div className="menu menu--hold" role="menu">
                      <button type="button" className="menu__item" role="menuitem" disabled={job.fileMissing} onClick={() => { setMenuFor(null); onPlay(job) }}>
                        <span className="menu__icon"><PlaySolidIcon width={18} height={18} /></span>
                        Play
                      </button>
                      <button type="button" className="menu__item" role="menuitem" disabled={job.fileMissing} onClick={() => { setMenuFor(null); shareJobs([job]) }}>
                        <span className="menu__icon"><ShareIcon width={18} height={18} /></span>
                        Share
                      </button>
                      <button type="button" className="menu__item" role="menuitem" onClick={() => { setMenuFor(null); setSheet({ kind: 'info', job }) }}>
                        <span className="menu__icon"><InfoIcon width={18} height={18} /></span>
                        Info
                      </button>
                      <button type="button" className="menu__item" role="menuitem" onClick={() => startSelect(job.id)}>
                        <span className="menu__icon"><SelectIcon width={18} height={18} /></span>
                        Select
                      </button>
                      <button type="button" className="menu__item menu__item--danger" role="menuitem" onClick={() => { setMenuFor(null); setConfirmFor(job.id) }}>
                        <span className="menu__icon menu__icon--danger"><TrashIcon width={18} height={18} /></span>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {selecting && (
        <div className="selbar" role="toolbar" aria-label="Selection actions">
          {!bulkConfirm ? (
            <>
              <span className="selbar__count">{picked.length} selected</span>
              <button
                type="button"
                className="selbar__btn"
                disabled={picked.length === 0}
                onClick={() => shareJobs(files.filter((f) => picked.includes(f.job.id)).map((f) => f.job))}
              >
                Share
              </button>
              <button
                type="button"
                className="selbar__btn selbar__btn--danger"
                disabled={picked.length === 0}
                onClick={() => setBulkConfirm(true)}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <span className="selbar__text">Delete {picked.length} files? This can't be undone.</span>
              <button type="button" className="selbar__btn" onClick={() => setBulkConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="selbar__btn selbar__btn--danger-solid"
                onClick={() => {
                  for (const id of picked) onDelete(id)
                  endSelect()
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {sheet && (
        <>
          <button type="button" className="bsheet__backdrop" aria-label="Close" onClick={() => setSheet(null)} />
          <aside className="bsheet" role="dialog" aria-label={sheet.kind === 'info' ? 'File info' : 'Storage'}>
            <span className="bsheet__grab" />
            {sheet.kind === 'info' && infoJob && (
              <>
                <div className="bsheet__title">{infoJob.title}</div>
                <div className="bsheet__grid">
                  <span>Format</span>
                  <span>{infoJob.formatLabel} · {infoJob.ext.toUpperCase()}</span>
                  <span>Size</span>
                  <span>{formatBytes(infoJob.receivedBytes)}</span>
                  <span>Duration</span>
                  <span>{formatDuration(infoJob.durationSec)}</span>
                  <span>Saved</span>
                  <span>{whenLabel(infoJob.completedAt ?? infoJob.createdAt)}</span>
                  <span>Source</span>
                  <span>{hostOf(infoJob.url)}</span>
                  <span>Notes</span>
                  <span>
                    {infoJob.isPrivate ? 'Private download' : 'Saved to Library'}
                    {infoJob.fileMissing ? ' · File missing' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="bsheet__btn bsheet__btn--primary"
                  onClick={() => {
                    setSheet(null)
                    onOpenSource(infoJob.url)
                  }}
                >
                  Open source page
                </button>
              </>
            )}
            {sheet.kind === 'storage' && (
              <>
                <div className="bsheet__title">Storage</div>
                <div className="storage__bar">
                  <span className="storage__seg storage__seg--video" style={{ width: storage.videoPct }} />
                  <span className="storage__seg storage__seg--audio" style={{ width: storage.audioPct }} />
                </div>
                <div className="storage__legend">
                  <span>Video {storage.video}</span>
                  <span>Audio {storage.audio}</span>
                  <span>Free {storage.free}</span>
                </div>
                <div className="storage__label">Largest files</div>
                {storage.largest.map((f) => (
                  <div className="storage__row" key={f.job.id}>
                    <span>{f.job.title}</span>
                    <span>{formatBytes(f.job.receivedBytes)}</span>
                  </div>
                ))}
                <button
                  type="button"
                  className="bsheet__btn"
                  onClick={() => {
                    const ids = storage.largest.slice(0, 3).map((f) => f.job.id)
                    setSheet(null)
                    setSelecting(true)
                    setPicked(ids)
                  }}
                >
                  Select large files
                </button>
              </>
            )}
          </aside>
        </>
      )}
    </div>
  )
}
