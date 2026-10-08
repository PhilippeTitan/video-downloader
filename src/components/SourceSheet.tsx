import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { CloseIcon } from './Icons'

interface SourceSheetProps {
  open: boolean
  /** Header copy: tracks scanning/error state, driven by App. */
  title: string
  onClose: () => void
  children: ReactNode
}

/** How far down the sheet must travel before a release dismisses it. */
const DISMISS_PX = 90

/**
 * Modal sheet that rises from the bottom and rests near the middle of the
 * screen. Drag the header to dismiss; tapping the backdrop or the close
 * button works too. Content (skeleton / error / source card) slots in as
 * children and scrolls inside the body.
 */
export function SourceSheet({ open, title, onClose, children }: SourceSheetProps) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef(0)
  const dragYRef = useRef(0)
  const dragging = useRef(false)

  // Freeze the page behind the sheet while it is open.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true
    startY.current = event.clientY
    dragYRef.current = 0
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const next = Math.max(0, event.clientY - startY.current)
    dragYRef.current = next
    setDragY(next)
  }

  const releaseCapture = (element: HTMLDivElement, pointerId: number) => {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    releaseCapture(event.currentTarget, event.pointerId)
    const dismiss = dragYRef.current > DISMISS_PX
    dragYRef.current = 0
    setDragY(0)
    if (dismiss) onClose()
  }

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false
    dragYRef.current = 0
    setDragY(0)
    releaseCapture(event.currentTarget, event.pointerId)
  }

  return (
    <div className={`sheet-layer${open ? ' is-open' : ''}`}>
      <div className="sheet__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className={`sheet${dragY > 0 ? ' is-dragging' : ''}`}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="sheet__head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <span className="sheet__grab" />
          <span className="sheet__title">{title}</span>
          <button
            type="button"
            className="btn btn--icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  )
}
