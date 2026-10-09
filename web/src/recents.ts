/**
 * Home "Recent searches" (Gen-2 design): last 6 launch texts, persisted
 * under a versioned key (D049). Skipped for private-mode launches.
 */

const STORAGE_KEY = 'vd-recents-v1'
const MAX_RECENTS = 6

export function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTS)
      }
    }
  } catch {
    /* corrupt payload */
  }
  return []
}

/** Deduped (case-insensitive), most-recent first. Returns the new list. */
export function pushRecent(text: string): string[] {
  const t = text.trim()
  const current = loadRecents()
  if (!t) return current
  const lower = t.toLowerCase()
  const next = [t, ...current.filter((r) => r.toLowerCase() !== lower)].slice(0, MAX_RECENTS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}

export function clearRecents() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
