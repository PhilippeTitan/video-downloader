import type { Tab } from '../types'
import { DownloadIcon, HomeIcon, LibraryIcon, SettingsIcon } from './Icons'

interface BottomNavProps {
  tab: Tab
  onChange: (tab: Tab) => void
  /** Number of in-flight downloads, shown as a badge on the Downloads tab. */
  activeCount: number
}

const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'downloads', label: 'Downloads', Icon: DownloadIcon },
  { id: 'downloaded', label: 'Downloaded', Icon: LibraryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
] as const

export function BottomNav({ tab, onChange, activeCount }: BottomNavProps) {
  return (
    <nav className="tabbar" aria-label="Main">
      <ul className="tabbar__list">
        {TABS.map(({ id, label, Icon }) => {
          const current = tab === id
          return (
            <li key={id}>
              <button
                type="button"
                className={`tabbar__item${current ? ' tabbar__item--active' : ''}`}
                aria-current={current ? 'page' : undefined}
                onClick={() => onChange(id)}
              >
                <span className="tabbar__icon">
                  <Icon width={21} height={21} />
                  {id === 'downloads' && activeCount > 0 && (
                    <span className="tabbar__dot">{activeCount}</span>
                  )}
                </span>
                <span className="tabbar__label">{label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
