import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Gen-3 sequence engine (design sections A/B): the search pill flies from
 * the hero center to its top park, the home stack clips away, real analyze
 * results arrive in the choreographed panel, then the whole session sweeps
 * back down on download/dismiss.
 *
 * Phase timings match the prototype's 30 ms tick contract (linear sp, eased
 * geometry): fade 667 ms → scan 1200 ms → load (real gate, 900 ms floor) →
 * done 429 ms ramp then park → rdown 750 ms → rup 667 ms → rfade 375 ms.
 */
export type SeqPhase = 'fade' | 'scan' | 'load' | 'done' | 'error' | 'rdown' | 'rup' | 'rfade'

const TICK_MS = 30
const DELTA: Record<SeqPhase, number> = {
  fade: 0.045,
  scan: 0.025,
  load: 0,
  done: 0.07,
  error: 0.07,
  rdown: 0.04,
  rup: 0.045,
  rfade: 0.08,
}
/** load never flashes shorter than this even on cached/instant resolves. */
const LOAD_FLOOR_MS = 900
/** Parked pill top offset inside the hero (below the browse pill rows). */
const PARK_TOP = 56
/** Matches `.results-panel { top }` — the rdown clip glues to the pill bottom. */
const RES_TOP = 188

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

export interface SequenceOptions {
  /** fade → scan: commit the launched text to the app's url state. */
  onTypingDone?: (text: string) => void
  /** scan → load (or reload/retry): kick the real navigation + analyze.
   *  nav=false re-analyzes an already-loaded page (tab switches). */
  onScanStart?: (text: string, nav: boolean) => void
  /** load → done: the lookup succeeded — record the recent (D025 gated). */
  onLoadSettled?: (text: string) => void
  /** rdown entry: cancel any pending analyze; results stay visible while clipping. */
  onReturnStart?: () => void
  /** rfade end / jump-cut: full session cleanup back to clean idle. */
  onIdle?: () => void
}

export interface SequenceApi {
  phase: SeqPhase | null
  /** Launch text of the current session (empty at idle). */
  text: string
  /** fade: typed prefix for the input; rfade: tile re-appearance dim (0..1). */
  typed: string
  dimOp: number | null
  parked: boolean
  pageUp: boolean
  flying: boolean
  stageRef: RefObject<HTMLDivElement | null>
  launch: (text: string) => void
  submit: (text: string, nav?: boolean) => void
  reload: (text: string, nav?: boolean) => void
  retry: () => void
  notifyAnalyzeDone: (ok: boolean) => void
  dismiss: () => void
  downloadStarted: () => void
  cancelJumpCut: () => void
}

export function useSequence(options: SequenceOptions): SequenceApi {
  const [phase, setPhaseState] = useState<SeqPhase | null>(null)
  const [tick, setTick] = useState<{ typed: string; dimOp: number | null }>({
    typed: '',
    dimOp: null,
  })

  const stageRef = useRef<HTMLDivElement | null>(null)
  const phaseRef = useRef<SeqPhase | null>(null)
  const spRef = useRef(0)
  const textRef = useRef('')
  /** Park delta: idle pill center → parked pill center (negative, px). */
  const parkRef = useRef(-350)
  /** Overshoot below center at rdown end (positive, px). */
  const overRef = useRef(350)
  /** Home stack height — the scan wipe must fully hide it by park. */
  const stackHRef = useRef(240)
  const skipRef = useRef(false)
  const navRef = useRef(true)
  const loadAtRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const reduced = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** Measure idle→park delta from live hero geometry (hero height is stable). */
  const measurePark = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    const h = el.clientHeight || 540
    const p = PARK_TOP + 30 - h / 2
    parkRef.current = p
    overRef.current = Math.abs(p) * (520 / 512)
    stackHRef.current =
      el.querySelector<HTMLElement>('.hstack')?.clientHeight || stackHRef.current
  }, [])

  const writeVars = useCallback(() => {
    const el = stageRef.current
    const ph = phaseRef.current
    if (!el || !ph) return
    const sp = clamp01(spRef.current)
    const P = parkRef.current
    const O = overRef.current
    const span = Math.abs(P) + O

    let barOff = 0
    if (ph === 'scan') barOff = P * eio(sp)
    else if (ph === 'load' || ph === 'done' || ph === 'error') barOff = P
    else if (ph === 'rdown') barOff = P + span * eio(sp)
    else if (ph === 'rup') barOff = O - O * eio(sp)

    const flight = P === 0 ? 0 : clamp01(-barOff / P)
    // Stack wipe: cut the hstack from the bottom (prototype inset(0 0 B 0)).
    // Our hero is shorter than the prototype's, so the travel-based glue
    // (dist − 22) would leave a remnant at park — wipe proportionally to the
    // measured stack height instead: fully hidden exactly at scan end.
    const clip =
      ph === 'scan'
        ? Math.max(0, Math.round(stackHRef.current * eio(sp)))
        : ph === 'load' || ph === 'done' || ph === 'error' || ph === 'rdown' || ph === 'rup'
          ? 9999
          : 0
    const laser =
      ph === 'fade'
        ? sp
        : ph === 'scan' || ph === 'load' || ph === 'rdown' || ph === 'rup'
          ? 1
          : ph === 'done' || ph === 'error' || ph === 'rfade'
            ? 1 - sp
            : 0
    const runOp = ph === 'load' ? 1 : ph === 'done' ? 1 - sp : 0
    // Status line reveals with the results ramp; load shows it immediately.
    const resOp =
      ph === 'load' || ph === 'rdown' ? 1 : ph === 'done' || ph === 'error' ? sp : 0
    const resY = ph === 'rdown' ? 0 : Math.round((1 - sp) * 16)
    let resClip = 0
    if (ph === 'rdown') {
      // Prototype glue: the panel's top clip follows the pill's bottom edge
      // (pill bottom row = heroCenter − 30 + barOff + 60).
      const pillBottom = (el.clientHeight || 540) / 2 + 30 + barOff
      resClip = Math.max(0, Math.round(pillBottom - RES_TOP))
    }
    const stackOp = ph === 'rfade' ? sp : 1

    const s = el.style
    s.setProperty('--seq-y', `${Math.round(barOff)}px`)
    s.setProperty('--seq-w', `${Math.round(560 - 68 * flight)}px`)
    s.setProperty('--seq-clip', `${clip}px`)
    s.setProperty('--seq-laser', String(Number(laser.toFixed(3))))
    s.setProperty('--seq-run-op', String(Number(runOp.toFixed(3))))
    s.setProperty('--seq-res-op', String(Number(resOp.toFixed(3))))
    s.setProperty('--seq-res-y', `${resY}px`)
    s.setProperty('--seq-clip-top', `${resClip}px`)
    s.setProperty('--seq-stack-op', String(Number(stackOp.toFixed(3))))
  }, [])

  const clearVars = useCallback(() => {
    const s = stageRef.current?.style
    if (!s) return
    s.setProperty('--seq-y', '0px')
    s.setProperty('--seq-w', '560px')
    s.setProperty('--seq-clip', '0px')
    s.setProperty('--seq-laser', '0')
    s.setProperty('--seq-run-op', '0')
    s.setProperty('--seq-res-op', '0')
    s.setProperty('--seq-res-y', '16px')
    s.setProperty('--seq-clip-top', '0px')
    s.setProperty('--seq-stack-op', '1')
  }, [])

  const stopTick = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    loadTimerRef.current = null
  }

  const toIdle = useCallback(() => {
    stopTick()
    phaseRef.current = null
    spRef.current = 0
    textRef.current = ''
    skipRef.current = false
    setTick({ typed: '', dimOp: null })
    setPhaseState(null)
    clearVars()
    optionsRef.current.onIdle?.()
  }, [clearVars])

  const transition = useCallback(
    (to: SeqPhase) => {
      const from = phaseRef.current
      phaseRef.current = to
      spRef.current = 0
      // Launched tile stays dimmed for the whole session; rfade re-ramps it.
      setTick({ typed: '', dimOp: to === 'fade' ? null : 0 })
      setPhaseState(to)
      if (to === 'load') loadAtRef.current = Date.now()
      if (to === 'done') optionsRef.current.onLoadSettled?.(textRef.current)
      if (to === 'rdown') optionsRef.current.onReturnStart?.()
      writeVars()
      // Fire the real navigation + analyze when entering load.
      if (to === 'load' && (from === 'scan' || from === 'done' || from === 'error')) {
        optionsRef.current.onScanStart?.(textRef.current, navRef.current)
      }
    },
    [writeVars],
  )

  const tickOnce = useCallback(() => {
    const ph = phaseRef.current
    if (!ph) return
    const next = spRef.current + DELTA[ph]

    if (ph === 'fade') {
      spRef.current = next
      if (next >= 1) {
        spRef.current = 1
        optionsRef.current.onTypingDone?.(textRef.current)
        transition('scan')
        return
      }
      setTick({ typed: textRef.current.slice(0, Math.ceil(next * textRef.current.length)), dimOp: 1 - next })
      writeVars()
      return
    }
    if (ph === 'rfade') {
      spRef.current = next
      if (next >= 1) {
        toIdle()
        return
      }
      setTick({ typed: '', dimOp: next })
      writeVars()
      return
    }
    if (ph === 'done' || ph === 'error') {
      spRef.current = Math.min(1, next)
      writeVars()
      return
    }
    if (ph === 'load') {
      // Gate is external (notifyAnalyzeDone); geometry is static while waiting.
      return
    }
    spRef.current = next
    if (next >= 1) {
      if (ph === 'scan') transition('load')
      else if (ph === 'rdown') transition('rup')
      else if (ph === 'rup') transition('rfade')
      return
    }
    writeVars()
  }, [transition, toIdle, writeVars])

  const tickOnceRef = useRef(tickOnce)
  tickOnceRef.current = tickOnce

  const ensureTicking = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setInterval(() => tickOnceRef.current(), TICK_MS)
  }, [])

  // Never leak the interval on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    },
    [],
  )

  const begin = useCallback(
    (entry: SeqPhase, text: string, nav: boolean) => {
      if (phaseRef.current !== null) return
      textRef.current = text
      navRef.current = nav
      measurePark()
      if (reduced()) {
        // Jump-cut: pill appears parked, runner/analyze start immediately.
        optionsRef.current.onTypingDone?.(text)
        phaseRef.current = 'load'
        spRef.current = 0
        setPhaseState('load')
        loadAtRef.current = Date.now()
        writeVars()
        optionsRef.current.onScanStart?.(text, navRef.current)
        return
      }
      phaseRef.current = entry
      spRef.current = 0
      setPhaseState(entry)
      if (entry === 'scan') optionsRef.current.onTypingDone?.(text)
      writeVars()
      ensureTicking()
    },
    [ensureTicking, measurePark, writeVars],
  )

  const launch = useCallback((text: string) => begin('fade', text, true), [begin])
  const submit = useCallback(
    (text: string, nav = true) => begin('scan', text, nav),
    [begin],
  )

  /** Parked (done/error) → load: re-run the lookup without a new flight.
   *  nav overrides the session flag (false = refresh/tab already loaded —
   *  re-read the page instead of navigating again). */
  const reload = useCallback(
    (text: string, nav?: boolean) => {
      if (phaseRef.current !== 'done' && phaseRef.current !== 'error') return
      textRef.current = text
      if (nav !== undefined) navRef.current = nav
      if (reduced()) {
        optionsRef.current.onScanStart?.(text, navRef.current)
        loadAtRef.current = Date.now()
        phaseRef.current = 'load'
        setPhaseState('load')
        writeVars()
        return
      }
      transition('load')
      ensureTicking()
    },
    [ensureTicking, transition, writeVars],
  )

  const retry = useCallback(() => {
    if (phaseRef.current !== 'error') return
    reload(textRef.current)
  }, [reload])

  const notifyAnalyzeDone = useCallback(
    (ok: boolean) => {
      if (phaseRef.current !== 'load') return
      const finish = () => {
        if (phaseRef.current !== 'load') return
        transition(ok ? 'done' : 'error')
        ensureTicking()
      }
      const remaining = LOAD_FLOOR_MS - (Date.now() - loadAtRef.current)
      if (remaining > 0) {
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
        loadTimerRef.current = setTimeout(finish, remaining)
      } else {
        finish()
      }
    },
    [ensureTicking, transition], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const dismiss = useCallback(() => {
    const ph = phaseRef.current
    if (ph !== 'load' && ph !== 'done' && ph !== 'error') return
    if (reduced()) {
      optionsRef.current.onReturnStart?.()
      toIdle()
      return
    }
    transition('rdown')
    ensureTicking()
  }, [ensureTicking, toIdle, transition]) // eslint-disable-line react-hooks/exhaustive-deps

  const downloadStarted = useCallback(() => {
    if (phaseRef.current !== 'done') return
    if (reduced()) {
      optionsRef.current.onReturnStart?.()
      toIdle()
      return
    }
    transition('rdown')
    ensureTicking()
  }, [ensureTicking, toIdle, transition]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelJumpCut = useCallback(() => {
    if (phaseRef.current === null) return
    stopTick()
    phaseRef.current = null
    spRef.current = 0
    textRef.current = ''
    setTick({ typed: '', dimOp: null })
    setPhaseState(null)
    clearVars()
    optionsRef.current.onReturnStart?.()
    optionsRef.current.onIdle?.()
  }, [clearVars]) // eslint-disable-line react-hooks/exhaustive-deps

  const parked = phase === 'done' || phase === 'error'
  const pageUp =
    phase === 'fade' ||
    phase === 'scan' ||
    phase === 'load' ||
    phase === 'done' ||
    phase === 'error'
  const flying = phase === 'fade' || phase === 'scan' || phase === 'rdown' || phase === 'rup'

  return {
    phase,
    text: textRef.current,
    typed: tick.typed,
    dimOp: tick.dimOp,
    parked,
    pageUp,
    flying,
    stageRef,
    launch,
    submit,
    reload,
    retry,
    notifyAnalyzeDone,
    dismiss,
    downloadStarted,
    cancelJumpCut,
  }
}
