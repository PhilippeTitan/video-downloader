import type { ReactNode } from 'react'
import { InstagramBrandIcon, TikTokBrandIcon, XBrandIcon, YouTubeBrandIcon } from './Icons'

interface ShortcutTile {
  id: string
  name: string
  url: string
  color: string
  icon: ReactNode
}

const SHORTCUTS: ShortcutTile[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://m.youtube.com',
    color: '#ff0033',
    icon: <YouTubeBrandIcon width={26} height={26} />,
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    url: 'https://www.tiktok.com',
    color: '#25f4ee',
    icon: <TikTokBrandIcon width={26} height={26} />,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com',
    color: '#d62976',
    icon: <InstagramBrandIcon width={26} height={26} />,
  },
  {
    id: 'x',
    name: 'X',
    url: 'https://x.com',
    color: '#e7e9ea',
    icon: <XBrandIcon width={24} height={24} />,
  },
]

interface ShortcutTilesProps {
  onSelect: (url: string) => void
}

export function ShortcutTiles({ onSelect }: ShortcutTilesProps) {
  return (
    <div className="shortcuts" aria-label="Quick Sites">
      <div className="shortcuts__grid">
        {SHORTCUTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="shortcut-tile"
            onClick={() => onSelect(s.url)}
          >
            <span
              className="shortcut-tile__icon"
              style={{ backgroundColor: `${s.color}1a`, borderColor: `${s.color}3a` }}
            >
              {s.icon}
            </span>
            <span className="shortcut-tile__name">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
