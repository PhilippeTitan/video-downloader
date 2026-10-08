import { useMemo } from 'react'
import { formatBytes, formatDuration, resolutionLabel, sortFormats } from '../format'
import type { VideoInfo } from '../types'
import { CloseIcon, FilmIcon, MusicIcon } from './Icons'

interface VideoPanelProps {
  video: VideoInfo
  /** Selection lives in App so the floating download button can read it. */
  selectedId: string | null
  onSelect: (formatId: string) => void
  onDismiss: () => void
}

export function VideoPanel({ video, selectedId, onSelect, onDismiss }: VideoPanelProps) {
  const formats = useMemo(() => sortFormats(video.formats), [video.formats])

  return (
    <section className="card">
      <div className="video">
        <div className="video__thumb">
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt="" loading="lazy" />
          ) : (
            <FilmIcon width={26} height={26} />
          )}
          {video.durationSec !== undefined && (
            <span className="video__duration">{formatDuration(video.durationSec)}</span>
          )}
        </div>
        <div className="video__meta">
          <h2 className="video__title" title={video.title}>
            {video.title}
          </h2>
          <p className="video__sub">
            {video.uploader ?? 'Unknown uploader'}
            <span className="dot" />
            {video.extractor}
            <span className="dot" />
            {formats.length} formats
          </p>
        </div>
        <button
          type="button"
          className="btn btn--icon video__close"
          aria-label="Clear selection"
          title="Clear selection"
          onClick={onDismiss}
        >
          <CloseIcon width={16} height={16} />
        </button>
      </div>

      <div className="card__head">
        <h3 className="card__title">Choose a format</h3>
        <span className="card__hint">Tap to change</span>
      </div>

      <div className="formats" role="radiogroup" aria-label="Available formats">
        {formats.map((format) => {
          const isActive = format.id === selectedId
          return (
            <button
              key={format.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`fmt${isActive ? ' fmt--active' : ''}`}
              onClick={() => onSelect(format.id)}
            >
              <span className={`fmt__glyph fmt__glyph--${format.kind}`}>
                {format.kind === 'audio' ? (
                  <MusicIcon width={16} height={16} />
                ) : (
                  <FilmIcon width={16} height={16} />
                )}
              </span>
              <span className="fmt__label">{resolutionLabel(format)}</span>
              <span className="fmt__tags">
                <span className="tag">{format.ext.toUpperCase()}</span>
                {format.fps ? <span className="tag tag--dim">{format.fps}fps</span> : null}
                {format.vcodec ? <span className="tag tag--dim">{format.vcodec}</span> : null}
              </span>
              <span className="fmt__size">{formatBytes(format.filesizeBytes)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
