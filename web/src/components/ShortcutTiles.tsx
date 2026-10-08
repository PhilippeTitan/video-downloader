interface ShortcutTile {
  id: string
  name: string
  url: string
  color: string
  iconText: string
}

const SHORTCUTS: ShortcutTile[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://m.youtube.com',
    color: '#ff0000',
    iconText: '▶',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    url: 'https://www.tiktok.com',
    color: '#00f2fe',
    iconText: '♪',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com',
    color: '#e1306c',
    iconText: '📷',
  },
  {
    id: 'x',
    name: 'X',
    url: 'https://x.com',
    color: '#1da1f2',
    iconText: '𝕏',
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
              style={{ backgroundColor: `${s.color}22`, borderColor: `${s.color}44`, color: s.color }}
            >
              {s.iconText}
            </span>
            <span className="shortcut-tile__name">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
