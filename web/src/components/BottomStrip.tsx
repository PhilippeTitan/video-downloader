import type { DownloadJob } from '../types'

interface BottomStripProps {
  /** First active download, if any. */
  active: DownloadJob | null
  /** Currently playing job, if any. */
  playing: DownloadJob | null
  onTap: () => void
}

/**
 * Bottom strip (design section K): live progress of the first active
 * download or the now-playing job; tap jumps to Downloads / stops playback.
 */
export function BottomStrip({ active, playing, onTap }: BottomStripProps) {
  const pct =
    active && active.totalBytes
      ? Math.min(100, Math.round((active.receivedBytes / active.totalBytes) * 100))
      : 0

  const text = playing
    ? `Now playing: ${playing.title} (tap to stop)`
    : active
      ? `Downloading ${active.title} · ${pct}%`
      : ''

  if (!text) return null

  return (
    <button type="button" className="bottomstrip" onClick={onTap}>
      <span className="bottomstrip__text">{text}</span>
      {active && !playing && (
        <span className="bottomstrip__track">
          <span className="bottomstrip__bar" style={{ width: `${pct}%` }} />
        </span>
      )}
    </button>
  )
}
