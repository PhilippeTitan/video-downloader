/**
 * Home favorites (Gen-2 design): user-managed shortcut tiles persisted to
 * localStorage under a versioned key (D049). Seeded with the four brand
 * tiles from the prototype.
 */

export interface Favorite {
  id: string
  label: string
  url: string
  color: number
}

export const FAV_PALETTE = [
  { bg: '#2d2a55', ink: '#b7a6ff' },
  { bg: '#17382c', ink: '#3ecf8e' },
  { bg: '#3d2f12', ink: '#f2b84b' },
  { bg: '#3d1a26', ink: '#ff7a9c' },
] as const

const STORAGE_KEY = 'vd-fav-v1'
const MAX_LABEL = 14

const SEED: Favorite[] = [
  { id: 'f-yt', label: 'YouTube', url: 'youtube.com', color: 0 },
  { id: 'f-tt', label: 'TikTok', url: 'tiktok.com', color: 0 },
  { id: 'f-ig', label: 'Instagram', url: 'instagram.com', color: 0 },
  { id: 'f-x', label: 'X', url: 'x.com', color: 0 },
]

export function saveFavorites(list: Favorite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* quota */
  }
}

export function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Favorite[]
    }
  } catch {
    /* corrupt payload */
  }
  saveFavorites(SEED)
  return SEED
}

/** Strip scheme, www and any path — favorites store bare domains. */
export function cleanFavoriteUrl(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  const url = trimmed
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
  if (!url || !url.includes('.')) return null
  return url
}

export function favoriteLabel(name: string, url: string): string {
  const base = name.trim() || url
  return base.length > MAX_LABEL ? `${base.slice(0, MAX_LABEL - 1)}…` : base
}

/** Returns the new list, or null when the input is invalid or a duplicate. */
export function addFavorite(
  list: Favorite[],
  input: { name: string; url: string; color: number },
): Favorite[] | null {
  const url = cleanFavoriteUrl(input.url)
  if (!url) return null
  const label = favoriteLabel(input.name, url)
  if (list.some((f) => f.label.toLowerCase() === label.toLowerCase())) return null
  const next = [...list, { id: `f-${Date.now().toString(36)}`, label, url, color: input.color }]
  saveFavorites(next)
  return next
}

export function removeFavorite(list: Favorite[], id: string): Favorite[] {
  const next = list.filter((f) => f.id !== id)
  saveFavorites(next)
  return next
}
