import type { BrowserTab } from '../types'
import { CloseIcon, PlusIcon } from './Icons'

interface TabBarProps {
  tabs: BrowserTab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: TabBarProps) {
  if (tabs.length === 0) return null

  return (
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

          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={isActive}
              className={`tab-strip__tab ${isActive ? 'tab-strip__tab--active' : ''}`}
              onClick={() => onSelectTab(t.id)}
            >
              <span className="tab-strip__title">{display}</span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="tab-strip__close"
                  aria-label="Close Tab"
                  onClick={(e) => {
                    e.stopPropagation()
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
            onClick={onNewTab}
          >
            <PlusIcon width={15} height={15} />
          </button>
        )}
      </div>
    </div>
  )
}
