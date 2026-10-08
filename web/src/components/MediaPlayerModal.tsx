import { useEffect, useRef } from 'react'
import type { DownloadJob } from '../types'
import { CloseIcon, MusicIcon } from './Icons'

interface MediaPlayerModalProps {
  job: DownloadJob | null
  onClose: () => void
}

export function MediaPlayerModal({ job, onClose }: MediaPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!job) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [job, onClose])

  if (!job) return null

  const isAudio =
    job.ext === 'm4a' || job.ext === 'mp3' || job.formatLabel.toLowerCase().includes('audio')
  const src = job.filePath || job.url

  const handlePiP = async () => {
    if (videoRef.current && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture()
        } else {
          await videoRef.current.requestPictureInPicture()
        }
      } catch (err) {
        console.warn('PiP error:', err)
      }
    }
  }

  return (
    <div className="player-modal" role="dialog" aria-modal="true" aria-label="Media Player">
      <div className="player-modal__backdrop" onClick={onClose} />
      <div className="player-modal__content">
        <header className="player-modal__header">
          <div className="player-modal__info">
            <span className="player-modal__badge">{isAudio ? 'Audio' : 'Video'}</span>
            <h3 className="player-modal__title">{job.title}</h3>
          </div>
          <div className="player-modal__actions">
            {!isAudio && 'pictureInPictureEnabled' in document && (
              <button
                type="button"
                className="player-modal__btn"
                title="Picture-in-Picture"
                onClick={handlePiP}
              >
                PiP
              </button>
            )}
            <button
              type="button"
              className="player-modal__btn player-modal__btn--close"
              aria-label="Close Player"
              onClick={onClose}
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </header>

        <div className="player-modal__body">
          {isAudio ? (
            <div className="audio-screen">
              <div className="audio-screen__art">
                <MusicIcon width={64} height={64} />
              </div>
              <div className="audio-screen__meta">
                <h4 className="audio-screen__title">{job.title}</h4>
                <p className="audio-screen__format">{job.formatLabel}</p>
              </div>
              <audio
                ref={audioRef}
                src={src}
                controls
                autoPlay
                className="audio-screen__controls"
              />
            </div>
          ) : (
            <div className="video-screen">
              <video
                ref={videoRef}
                src={src}
                controls
                autoPlay
                playsInline
                className="video-screen__video"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
