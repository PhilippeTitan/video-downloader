import { GlobeIcon, DownloadIcon, LibraryIcon } from './Icons'
import type { Tab } from '../types'

/**
 * Left icon rail (mockup): three icon-only buttons in a single centered
 * column, gap 14. Active = light-purple ink + 1.15 scale, no pill fill.
 * Downloads badge = green count pill (top-right of the button).
 * Settings lives behind the top-left hamburger instead of the rail.
 */
export interface NavRailProps {
  tab: Tab
  onChange: (tab: Tab) => void
  activeCount: number
}

export function NavRail({ tab, onChange, activeCount }: NavRailProps) {
  const itemClass = (id: Tab) => `rail__item${tab === id ? ' rail__item--active' : ''}`

  return (
    <nav className="rail" aria-label="Main">
      <div className="rail__group">
        <button
          type="button"
          id="rail-home"
          className={itemClass('home')}
          aria-label="Home"
          aria-current={tab === 'home' ? 'page' : undefined}
          onClick={() => onChange('home')}
        >
          <GlobeIcon width={26} height={26} />
        </button>

        <button
          type="button"
          id="rail-downloads"
          className={itemClass('downloads')}
          aria-label={activeCount > 0 ? `Downloads, ${activeCount} active` : 'Downloads'}
          aria-current={tab === 'downloads' ? 'page' : undefined}
          onClick={() => onChange('downloads')}
        >
          <DownloadIcon width={26} height={26} />
          {activeCount > 0 && (
            <span key={activeCount} className="rail__badge">
              {activeCount}
            </span>
          )}
        </button>

        <button
          type="button"
          id="rail-library"
          className={itemClass('library')}
          aria-label="Library"
          aria-current={tab === 'library' ? 'page' : undefined}
          onClick={() => onChange('library')}
        >
          <LibraryIcon width={26} height={26} />
        </button>
      </div>
    </nav>
  )
}
