import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'

interface MarqueeOptions {
  /** Auto-scroll speed in px/s. Negative drifts left, positive right. */
  speed: number
  /** Freeze auto-scroll (modal open, etc.). */
  paused?: boolean
  /** Resume auto-scroll this long (ms) after the last interaction. */
  idleMs?: number
}

/**
 * Shared Home marquee engine (design sections D): pointer-drag with
 * capture, wheel support, and auto-scroll that resumes 1.8 s after the
 * last interaction. The track content is duplicated once by the caller;
 * `offset` is wrapped to one content width so the loop is seamless.
 */
export function useMarquee({ speed, paused = false, idleMs = 1800 }: MarqueeOptions) {
  const [offset, setOffset] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)
  const [dragging, setDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const lastXRef = useRef(0)
  const movedRef = useRef(0)
  const interactAtRef = useRef(0)
  // Auto-scroll only while the track actually overflows its viewport —
  // a single (or short) row sits still until it fills the line.
  const overflowingRef = useRef(false)

  // Track holds two identical copies; one copy's width is the wrap span.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => {
      const w = el.scrollWidth / 2
      setContentWidth(w)
      overflowingRef.current = w > (el.parentElement?.clientWidth ?? 0)
      if (!overflowingRef.current) setOffset(0)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.parentElement) observer.observe(el.parentElement)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (paused) return
    // Design helmet: reduced motion kills all animation — drift off, drag stays.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (
        overflowingRef.current &&
        !draggingRef.current &&
        now - interactAtRef.current > idleMs
      ) {
        setOffset((o) => o + speed * dt)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [speed, paused, idleMs])

  const wrapped =
    contentWidth > 0 ? (((offset % contentWidth) + contentWidth) % contentWidth) - contentWidth : offset

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true
    movedRef.current = 0
    lastXRef.current = e.clientX
    interactAtRef.current = performance.now()
    setDragging(true)
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const dx = e.clientX - lastXRef.current
    lastXRef.current = e.clientX
    movedRef.current += Math.abs(dx)
    interactAtRef.current = performance.now()
    if (movedRef.current > 6) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture unsupported */
      }
    }
    setOffset((o) => o + dx)
  }, [])

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    interactAtRef.current = performance.now()
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* release unsupported */
    }
  }, [])

  const onWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    interactAtRef.current = performance.now()
    setOffset((o) => o - (e.deltaX || 0))
  }, [])

  /** True when the last gesture moved past the click-suppression threshold. */
  const didDrag = () => movedRef.current > 6

  return {
    trackRef,
    offset: wrapped,
    dragging,
    didDrag,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onWheel,
    },
  }
}
