import type { Favorite } from '../favorites'
import { useMarquee } from '../hooks/useMarquee'
import { ClockIcon, EyeOffIcon } from './Icons'
import { Favorites } from './Favorites'

export interface HomeHeroProps {
  favorites: Favorite[]
  recents: string[]
  privateMode: boolean
  onLaunchFavorite: (fav: Favorite) => void
  onLaunchRecent: (text: string) => void
  onFavoritesChange: (next: Favorite[]) => void
}

/**
 * Idle-home hero stack (design section C): brand row above the favorites
 * and recents marquees; Private Browsing card replaces both while private
 * mode is on (D025).
 */
export function HomeHero({
  favorites,
  recents,
  privateMode,
  onLaunchFavorite,
  onLaunchRecent,
  onFavoritesChange,
}: HomeHeroProps) {
  return (
    <div className="hstack">
      <div className="hero__brand">
        <span className="hero__mark">
          <span className="hero__mark-tri" />
        </span>
        <span className="hero__wordmark">Video Downloader</span>
      </div>

      <div className="hstack__body">
        {privateMode ? (
          <div className="privatecard">
            <span className="privatecard__icon">
              <EyeOffIcon width={28} height={28} />
            </span>
            <div className="privatecard__title">Private Browsing</div>
          </div>
        ) : (
          <>
            <Favorites
              favorites={favorites}
              onLaunch={onLaunchFavorite}
              onChange={onFavoritesChange}
            />
            {recents.length > 0 && (
              <RecentsBlock recents={recents} onLaunch={onLaunchRecent} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function RecentsBlock({ recents, onLaunch }: { recents: string[]; onLaunch: (t: string) => void }) {
  const { trackRef, offset, dragging, didDrag, handlers } = useMarquee({ speed: 25 })

  const tile = (text: string, clone: boolean) => (
    <button
      key={`${text}${clone ? '-c' : ''}`}
      type="button"
      className="mtile mtile--recent"
      aria-hidden={clone || undefined}
      tabIndex={clone ? -1 : undefined}
      onClick={() => {
        if (didDrag()) return
        onLaunch(text)
      }}
    >
      <span className="mtile__icon">
        <ClockIcon width={26} height={26} />
      </span>
      <span className="mtile__label">{clipRecent(text)}</span>
    </button>
  )

  return (
    <div className="hblock">
      <span className="hblock__label">Recent searches</span>
      <div className={`marquee${dragging ? ' marquee--drag' : ''}`} {...handlers}>
        <div
          className="marquee__track"
          ref={trackRef}
          style={{ transform: `translateX(${offset}px)` }}
        >
          {recents.map((text) => tile(text, false))}
          <span aria-hidden="true" className="marquee__clone">
            {recents.map((text) => tile(text, true))}
          </span>
        </div>
      </div>
    </div>
  )
}

/** First two words, max 14 chars, with an ellipsis (design section D). */
function clipRecent(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 2).join(' ')
  return words.length > 14 ? `${words.slice(0, 13)}…` : words
}
