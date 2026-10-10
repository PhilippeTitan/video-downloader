import type { RefObject } from 'react'
import { SearchIcon } from './Icons'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}

/** Five racing dash layers around the pill while a lookup runs (design E). */
const RUNNER = [
  { len: 60, stroke: '#ffffff', opacity: 1 },
  { len: 130, stroke: '#d6ccff', opacity: 0.8 },
  { len: 220, stroke: '#b7a6ff', opacity: 0.55 },
  { len: 340, stroke: '#9b83ff', opacity: 0.35 },
  { len: 480, stroke: '#7c5cff', opacity: 0.2 },
]
const PERIMETER = 1074.5

/** Bare-input search pill with the laser focus ring and analyze runner. */
export function SearchBar({ value, onChange, onSubmit, busy, inputRef }: SearchBarProps) {
  const canSubmit = value.trim().length > 0

  return (
    <form
      className="searchbar"
      onSubmit={(event) => {
        event.preventDefault()
        // The sequence machine guards re-entry; parked submits reload.
        if (canSubmit) onSubmit()
      }}
    >
      <div className="searchbar__field">
        <SearchIcon className="searchbar__lead" width={22} height={22} />
        <input
          id="home-search"
          ref={inputRef}
          className="searchbar__input"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
          spellCheck={false}
          placeholder="Search or paste a link"
          aria-label="Search or paste a link"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />

        {busy && (
          <svg
            className="searchbar__runner"
            viewBox="0 0 502 70"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {RUNNER.map((layer, i) => (
              <rect
                key={layer.stroke}
                className={`runner runner--${i}`}
                x={1.5}
                y={1.5}
                width={499}
                height={67}
                rx={33.5}
                stroke={layer.stroke}
                opacity={layer.opacity}
                strokeDasharray={`${layer.len} ${PERIMETER - layer.len}`}
              />
            ))}
          </svg>
        )}
      </div>
    </form>
  )
}
