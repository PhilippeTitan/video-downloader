import { useEffect, useRef, useState } from 'react'
import { ClipboardIcon, CloseIcon, LinkIcon, SearchIcon, SpinnerIcon } from './Icons'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
}

/** One field, no extra rows: paste and search live inside the bar. */
export function SearchBar({ value, onChange, onSubmit, busy }: SearchBarProps) {
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(hintTimer.current), [])

  const flashHint = (message: string) => {
    setHint(message)
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 2400)
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        flashHint('Clipboard is empty')
        return
      }
      onChange(text.trim())
      setHint(null)
    } catch {
      // Browsers only expose the clipboard after a permission grant.
      flashHint('Clipboard blocked - paste manually')
    }
  }

  // Anything goes: a URL, a bare domain, or a search phrase.
  const canSubmit = value.trim().length > 0

  return (
    <form
      className="searchbar"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit && !busy) onSubmit()
      }}
    >
      <div className="searchbar__field">
        <LinkIcon className="searchbar__lead" width={18} height={18} />
        <input
          className="searchbar__input"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
          spellCheck={false}
          placeholder="Search"
          aria-label="Search or video URL"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {value.length > 0 && (
          <button
            type="button"
            className="searchbar__icon"
            aria-label="Clear link"
            onClick={() => onChange('')}
          >
            <CloseIcon width={16} height={16} />
          </button>
        )}
        <button
          type="button"
          className="searchbar__icon"
          aria-label="Paste from clipboard"
          title="Paste from clipboard"
          onClick={() => void paste()}
        >
          <ClipboardIcon width={17} height={17} />
        </button>
        <button
          type="submit"
          className="searchbar__go"
          aria-label="Open"
          title="Open"
          disabled={!canSubmit || busy}
        >
          {busy ? (
            <SpinnerIcon className="spin" width={18} height={18} />
          ) : (
            <SearchIcon width={18} height={18} />
          )}
        </button>
      </div>

      {hint && <p className="searchbar__hint">{hint}</p>}
    </form>
  )
}
