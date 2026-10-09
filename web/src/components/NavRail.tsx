import { GlobeIcon, DownloadIcon, LibraryIcon, SettingsIcon } from './Icons'
import type { Tab } from '../types'

/**
 * Left icon rail (D032/D041): always on the left in every orientation,
 * vertically centered, icon-only. Active item = filled purple pill.
 * Settings sits at the bottom (replaces the old floating gear).
 *
 * Badges (D047): Downloads = active count (red if any failed);
 * Library = purple dot while any file is unplayed.
 */
export interface NavRailProps {
  tab: Tab
  onChange: (tab: Tab) => void
  activeCount: number
  hasFailed: boolean
  libNewDot: boolean
}

export function NavRail({ tab, onChange, activeCount, hasFailed, libNewDot }: NavRailProps) {
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
            <span
              key={activeCount}
              className={`rail__badge${hasFailed ? ' rail__badge--failed' : ''}`}
            >
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
          {libNewDot && <span className="rail__dot" aria-label="New files" />}
        </button>
      </div>

      <div className="rail__group rail__group--bottom">
        <button
          type="button"
          id="rail-settings"
          className={itemClass('settings')}
          aria-label="Settings"
          aria-current={tab === 'settings' ? 'page' : undefined}
          onClick={() => onChange('settings')}
        >
          <SettingsIcon width={26} height={26} />
        </button>
      </div>
    </nav>
  )
}
