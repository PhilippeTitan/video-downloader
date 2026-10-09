import type { CSSProperties } from 'react'
import { resolutionLabel } from '../format'
import type { VideoInfo } from '../types'
import { AlertIcon } from './Icons'
import { VideoPanel } from './VideoPanel'

interface ResultsPanelProps {
  phase: 'done' | 'error' | 'rdown'
  video: VideoInfo | null
  selectedFormatId: string | null
  error: string | null
  downloadError: string | null
  hasShell: boolean
  onSelect: (formatId: string) => void
  onDownload: (formatId: string) => void
  onRetry: () => void
  onDismiss: () => void
}

const stagger = (i: number) => ({ '--i': i }) as CSSProperties

/**
 * Choreographed results panel (design section B): mounts when the sequence
 * parks, reveals with the done ramp, and clips away with the return sweep.
 * Children pop in on a 40 ms stagger driven by --i.
 */
export function ResultsPanel({
  phase,
  video,
  selectedFormatId,
  error,
  downloadError,
  hasShell,
  onSelect,
  onDownload,
  onRetry,
  onDismiss,
}: ResultsPanelProps) {
  const selectedFormat = video?.formats.find((format) => format.id === selectedFormatId)

  return (
    <div className="results-panel">
      <div className="results-panel__inner">
        {phase === 'error' && (
          <>
            <div className="alert results-panel__item" style={stagger(0)} role="alert">
              <AlertIcon width={17} height={17} />
              <span>{error || 'Couldn\u2019t read that link'}</span>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--block results-panel__item"
              style={stagger(1)}
              onClick={onRetry}
            >
              Try again
            </button>
          </>
        )}

        {phase !== 'error' && video && (
          <>
            <div className="results-panel__item" style={stagger(0)}>
              <VideoPanel
                key={video.id}
                video={video}
                selectedId={selectedFormatId}
                onSelect={onSelect}
                onDismiss={onDismiss}
              />
            </div>

            {downloadError && (
              <div className="alert results-panel__item" style={stagger(1)} role="alert">
                <AlertIcon width={17} height={17} />
                <span>{downloadError}</span>
              </div>
            )}

            {selectedFormat && (
              <button
                type="button"
                className="btn btn--primary btn--block results-panel__item"
                style={stagger(downloadError ? 2 : 1)}
                onClick={() => onDownload(selectedFormat.id)}
              >
                Download {resolutionLabel(selectedFormat)} · {selectedFormat.ext.toUpperCase()}
              </button>
            )}
          </>
        )}

        {!hasShell && (
          <div className="card browser-stub results-panel__item" style={stagger(3)}>
            <div className="card__head">
              <span className="card__title">In-app browser</span>
              <span className="badge badge--dim">Preview</span>
            </div>
            <p className="browser-stub__text">
              Live pages render here inside the iOS app. Without the shell this preview opened
              your link in a new tab instead — on-device the sniffer watches the page and
              reports videos to the pill.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
