import type { BrowserTab } from '../types'
import { CloseIcon, PlusIcon } from './Icons'

/**
 * Fullscreen tab switcher (mockup 176–202): blurred backdrop, "Tabs"
 * header with a round + button and Done, and a 2-up grid of tall preview
 * cards with close buttons plus a dashed "new tab" card.
 */

export interface TabSwitcherProps {
  tabs: BrowserTab[]
  activeTabId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNewTab: () => void
  onDone: () => void
}

function hostOf(url: string): string {
  if (!url) return ''
  try {
    if (url.startsWith('http')) return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    /* raw string */
  }
  return url
}

export function TabSwitcher({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNewTab,
  onDone,
}: TabSwitcherProps) {
  return (
    <div className="tabsw" role="dialog" aria-label="Tabs">
      <div className="tabsw__header">
        <div className="tabsw__title">Tabs</div>
        <div className="tabsw__actions">
          <button type="button" className="tabsw__plus" aria-label="New tab" onClick={onNewTab}>
            <PlusIcon width={22} height={22} />
          </button>
          <button type="button" className="tabsw__done" onClick={onDone}>
            Done
          </button>
        </div>
      </div>

      <div className="tabsw__scroll">
        <div className="tabsw__grid">
          <button type="button" className="tabsw__new" aria-label="New tab" onClick={onNewTab}>
            +
          </button>

          {tabs.map((t) => {
            const display = t.title || hostOf(t.url) || 'New Tab'
            const sub = hostOf(t.url)
            const isActive = t.id === activeTabId
            return (
              <div className="tabsw__card" key={t.id}>
                <div className="tabsw__preview">
                  <button
                    type="button"
                    className={`tabsw__shot${isActive ? ' tabsw__shot--active' : ''}`}
                    aria-label={display}
                    onClick={() => onSelect(t.id)}
                  />
                  {tabs.length > 1 && (
                    <button
                      type="button"
                      className="tabsw__close"
                      aria-label={`Close ${display}`}
                      onClick={() => onClose(t.id)}
                    >
                      <CloseIcon width={18} height={18} />
                    </button>
                  )}
                </div>
                <div className="tabsw__meta">
                  <div className="tabsw__name">{display}</div>
                  {sub && <div className="tabsw__sub">{sub}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
