import { useState } from 'react'
import { addFavorite, FAV_PALETTE, removeFavorite } from '../favorites'
import type { Favorite } from '../favorites'
import { useMarquee } from '../hooks/useMarquee'
import { CloseIcon, PlusIcon } from './Icons'

interface FavoritesProps {
  favorites: Favorite[]
  onLaunch: (fav: Favorite) => void
  onChange: (next: Favorite[]) => void
}

/** Auto-scrolling favorites marquee with the dashed Add tile (design D). */
export function Favorites({ favorites, onLaunch, onChange }: FavoritesProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const { trackRef, offset, dragging, didDrag, handlers } = useMarquee({
    speed: -27,
    paused: modalOpen,
  })

  const submit = (input: { name: string; url: string; color: number }): boolean => {
    const next = addFavorite(favorites, input)
    if (!next) return false
    onChange(next)
    return true
  }

  const tile = (fav: Favorite, clone: boolean) => (
    <div key={`${fav.id}${clone ? '-c' : ''}`} className="mtile-wrap">
      <button
        type="button"
        className="mtile mtile--fav"
        aria-hidden={clone || undefined}
        tabIndex={clone ? -1 : undefined}
        onClick={() => {
          if (didDrag()) return
          onLaunch(fav)
        }}
      >
        <span
          className="mtile__icon"
          style={{
            background: FAV_PALETTE[fav.color]?.bg,
            color: FAV_PALETTE[fav.color]?.ink,
          }}
        >
          {fav.label.charAt(0).toUpperCase()}
        </span>
        <span className="mtile__label">{fav.label}</span>
      </button>
      {!clone && (
        <button
          type="button"
          className="mtile__x"
          aria-label={`Remove ${fav.label}`}
          onClick={() => onChange(removeFavorite(favorites, fav.id))}
        >
          <CloseIcon width={14} height={14} />
        </button>
      )}
    </div>
  )

  const addTile = (clone: boolean) => (
    <button
      key={clone ? 'add-c' : 'add'}
      type="button"
      className="mtile mtile--add"
      aria-hidden={clone || undefined}
      tabIndex={clone ? -1 : undefined}
      aria-label="Add a favorite"
      onClick={() => {
        if (didDrag()) return
        setModalOpen(true)
      }}
    >
      <span className="mtile__icon mtile__icon--add">
        <PlusIcon width={26} height={26} />
      </span>
      <span className="mtile__label">Add</span>
    </button>
  )

  return (
    <div className="hblock">
      <span className="hblock__label">Favorites</span>
      <div className={`marquee${dragging ? ' marquee--drag' : ''}`} {...handlers}>
        <div
          className="marquee__track"
          ref={trackRef}
          style={{ transform: `translateX(${offset}px)` }}
        >
          {favorites.map((fav) => tile(fav, false))}
          {addTile(false)}
          <span aria-hidden="true" className="marquee__clone">
            {favorites.map((fav) => tile(fav, true))}
            {addTile(true)}
          </span>
        </div>
      </div>

      <AddFavoriteModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={submit} />
    </div>
  )
}

interface AddFavoriteModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: { name: string; url: string; color: number }) => boolean
}

function AddFavoriteModal({ open, onClose, onSubmit }: AddFavoriteModalProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState(0)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = () => {
    if (onSubmit({ name, url, color })) {
      setName('')
      setUrl('')
      setColor(0)
      setError(null)
      onClose()
    } else {
      setError('Enter a site address that isn’t already in Favorites')
    }
  }

  return (
    <div
      className="favmodal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="favmodal" role="dialog" aria-label="Add a favorite">
        <h2 className="favmodal__title">Add a favorite</h2>

        <label className="favmodal__field">
          <span className="favmodal__label">Name</span>
          <input
            className="favmodal__input"
            type="text"
            placeholder="Optional"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="favmodal__field">
          <span className="favmodal__label">Site address</span>
          <input
            className="favmodal__input"
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. vimeo.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>

        <div className="favmodal__swatches" role="radiogroup" aria-label="Icon color">
          {FAV_PALETTE.map((swatch, i) => (
            <button
              key={swatch.bg}
              type="button"
              role="radio"
              aria-checked={color === i}
              aria-label={`Color ${i + 1}`}
              className={`favmodal__swatch${color === i ? ' favmodal__swatch--on' : ''}`}
              style={{ background: swatch.bg, color: swatch.ink }}
              onClick={() => setColor(i)}
            />
          ))}
        </div>

        {error && <p className="favmodal__error">{error}</p>}

        <div className="favmodal__actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
