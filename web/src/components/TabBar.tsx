import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BrowserTab } from '../types'
import { CloseIcon, PlusIcon } from './Icons'

interface TabBarProps {
  tabs: BrowserTab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
  /** Long-press menu: refresh the active tab's page + lookup (Q058). */
  onRefreshTab: (id: string) => void
}

/** Swipe distance (px) that commits a close; below that the pill snaps back. */
const CLOSE_THRESHOLD = 72
/** Movement slop before a press counts as a drag (vs a tap / long-press). */
const SLOP = 6
/** Hold time before the context menu opens. */
const LONG_PRESS_MS = 450
/** Assumed menu width for centering under the pill. */
const MENU_WIDTH = 150

interface DragState {
  id: string
  x: number
  snapping: boolean
}

interface MenuState {
  id: string
  left: number
  top: number
}

/**
 * Parked tab pill strip (Q010/Q016): tap to switch (choreographed by the
 * app), swipe a pill sideways to close it, long-press for a Refresh/Close
 * menu (Q058). Horizontal drags are ours (touch-action pan-y); the row
 * still scrolls through its free space and the "+" button.
 */
export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onRefreshTab,
}: TabBarProps) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const pressRef = useRef<{ id: string; x: number; y: number; long: boolean; moved: boolean; timer: number } | null>(null)
  const suppressClickRef = useRef(false)

  const clearPress = () => {
    const press = pressRef.current
    if (press) window.clearTimeout(press.timer)
    pressRef.current = null
  }

  useEffect(
    () => () => {
      const press = pressRef.current
      if (press) window.clearTimeout(press.timer)
      pressRef.current = null
    },
    [],
  )

  if (tabs.length === 0) return null

  const openMenu = (id: string, pillEl: HTMLElement) => {
    // Fixed viewport coords: the strip's overflow would clip an absolute menu.
    const pill = pillEl.getBoundingClientRect()
    const left = Math.max(
      12,
      Math.min(pill.left + pill.width / 2 - MENU_WIDTH / 2, window.innerWidth - MENU_WIDTH - 12),
    )
    setMenu({ id, left: Math.round(left), top: Math.round(pill.bottom + 8) })
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // The close button owns its own tap — don't hijack it.
    if ((e.target as HTMLElement).closest('.tab-strip__close')) return
    suppressClickRef.current = false
    setMenu(null)
    // A stale drag from a pill that just closed must not hijack this one.
    dragRef.current = null
    setDrag(null)
    const el = e.currentTarget
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort */
    }
    clearPress()
    pressRef.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      long: false,
      moved: false,
      timer: window.setTimeout(() => {
        const press = pressRef.current
        if (!press || press.moved || press.id !== id) return
        press.long = true
        suppressClickRef.current = true
        openMenu(id, el)
      }, LONG_PRESS_MS),
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const press = pressRef.current
    if (!press || press.id !== id) return
    const dx = e.clientX - press.x
    const dy = e.clientY - press.y
    if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) {
      press.moved = true
      window.clearTimeout(press.timer)
    }
    // Horizontal lock: only a sideways drag becomes a swipe-to-close.
    if (press.moved && !press.long && Math.abs(dx) > Math.abs(dy)) {
      if (tabs.length <= 1 && dx > 0) return // last tab can't swipe away
      dragRef.current = { id, x: dx, snapping: false }
      setDrag({ id, x: dx, snapping: false })
    }
  }

  const endPointer = (id: string) => {
    const press = pressRef.current
    if (press && press.id === id) {
      window.clearTimeout(press.timer)
      pressRef.current = null
      if (press.long) {
        suppressClickRef.current = true
        return
      }
    }
    const current = dragRef.current
    if (current && current.id === id) {
      dragRef.current = null
      suppressClickRef.current = true
      if (Math.abs(current.x) >= CLOSE_THRESHOLD) {
        setDrag(null)
        onCloseTab(id)
        return
      }
      // Snap back with the pill's resting transition, then settle.
      setDrag({ id, x: 0, snapping: true })
      window.setTimeout(() => {
        setDrag((d) => (d && d.id === id && d.x === 0 ? null : d))
      }, 240)
    }
  }

  const onPillClick = (id: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setMenu(null)
    onSelectTab(id)
  }

  const menuTab = menu ? tabs.find((t) => t.id === menu.id) : null

  return (
    <>
      {menu && (
        <div className="tab-menu-backdrop" onPointerDown={() => setMenu(null)} />
      )}
      <div className="tab-strip" role="tablist" aria-label="Browser Tabs">
        <div className="tab-strip__scroll">
          {tabs.map((t) => {
            const isActive = t.id === activeTabId
            let domain = t.url
            try {
              if (t.url && t.url.startsWith('http')) {
                domain = new URL(t.url).hostname.replace(/^www\./, '')
              }
            } catch {
              /* use raw string */
            }
            const display = t.title || domain || 'New Tab'
            const isDragging = drag?.id === t.id && !drag.snapping
            const isSnapping = drag?.id === t.id && drag.snapping
            const dx = drag?.id === t.id ? drag.x : 0

            return (
              <div
                key={t.id}
                role="tab"
                aria-selected={isActive}
                className={
                  `tab-strip__tab${isActive ? ' tab-strip__tab--active' : ''}` +
                  (isDragging ? ' tab-strip__tab--dragging' : '') +
                  (isSnapping ? ' tab-strip__tab--snapping' : '')
                }
                style={
                  dx !== 0
                    ? {
                        transform: `translateX(${dx}px)`,
                        opacity: String(Math.max(0.35, 1 - Math.abs(dx) / 200)),
                      }
                    : undefined
                }
                onClick={() => onPillClick(t.id)}
                onPointerDown={(e) => onPointerDown(e, t.id)}
                onPointerMove={(e) => onPointerMove(e, t.id)}
                onPointerUp={() => endPointer(t.id)}
                onPointerCancel={() => endPointer(t.id)}
              >
                <span className="tab-strip__title">{display}</span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    className="tab-strip__close"
                    aria-label={`Close ${display}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenu(null)
                      onCloseTab(t.id)
                    }}
                  >
                    <CloseIcon width={12} height={12} />
                  </button>
                )}
              </div>
            )
          })}

          {tabs.length < 10 && (
            <button
              type="button"
              className="tab-strip__new"
              aria-label="Open New Tab"
              onClick={() => {
                setMenu(null)
                onNewTab()
              }}
            >
              <PlusIcon width={15} height={15} />
            </button>
          )}
        </div>
      </div>

      {menu && menuTab && (
        <div
          className="tab-menu"
          style={{ left: `${menu.left}px`, top: `${menu.top}px` }}
          role="menu"
        >
          {menuTab.id === activeTabId && menuTab.url && (
            <button
              type="button"
              className="tab-menu__item"
              role="menuitem"
              onClick={() => {
                setMenu(null)
                onRefreshTab(menuTab.id)
              }}
            >
              Refresh
            </button>
          )}
          {tabs.length > 1 && (
            <button
              type="button"
              className="tab-menu__item"
              role="menuitem"
              onClick={() => {
                setMenu(null)
                onCloseTab(menuTab.id)
              }}
            >
              Close tab
            </button>
          )}
        </div>
      )}
    </>
  )
}
