import type { BrowserTab } from '../types'

/**
 * Browse-session chrome (mockup 136–139, 152–153): fixed back/forward
 * chevrons at the left and the Safari-style dual-row tab pills — the active
 * tab as a tall pill on the top row, the rest peeking smaller below. Rows
 * sit at the mockup's exact viewport coordinates and fade their edges when
 * the pill row overflows.
 */

export interface BrowseChromeProps {
  tabs: BrowserTab[]
  activeTabId: string
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  onSelectTab: (id: string) => void
}

function titleOf(tab: BrowserTab): string {
  if (tab.title) return tab.title
  if (tab.url && tab.url.startsWith('http')) {
    try {
      return new URL(tab.url).hostname.replace(/^www\./, '')
    } catch {
      /* raw */
    }
  }
  return 'New Tab'
}

/** Mockup edge fade: only when the row overflows its 492px stage. */

export function BrowseChrome({
  tabs,
  activeTabId,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onSelectTab,
}: BrowseChromeProps) {
  const ordered = [...tabs]
  const topOverflow = ordered.length > 3
  const underOverflow = ordered.length > 4

  return (
    <>
      <div className="browse-chevrons">
        <button
          type="button"
          className="browse-chevrons__btn"
          aria-label="Back"
          disabled={!canGoBack}
          onClick={onBack}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          className="browse-chevrons__btn"
          aria-label="Forward"
          disabled={!canGoForward}
          onClick={onForward}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="browse-pills" role="tablist" aria-label="Browser Tabs">
        <div
          className={`browse-pills__row browse-pills__row--top${topOverflow ? ' browse-pills__row--masked' : ''}`}
        >
          {ordered.map((t) => {
            const isActive = t.id === activeTabId
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`browse-pill browse-pill--top${isActive ? ' browse-pill--active' : ''}`}
                onClick={() => onSelectTab(t.id)}
              >
                <span className="browse-pill__label">{titleOf(t)}</span>
              </button>
            )
          })}
        </div>
        <div
          className={`browse-pills__row browse-pills__row--under${underOverflow ? ' browse-pills__row--masked' : ''}`}
        >
          {ordered.map((t) => {
            const isActive = t.id === activeTabId
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`browse-pill browse-pill--under${isActive ? ' browse-pill--active' : ''}`}
                onClick={() => onSelectTab(t.id)}
              >
                <span className="browse-pill__label">{titleOf(t)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
