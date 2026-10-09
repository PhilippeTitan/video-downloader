import { AlertIcon, ArrowDownIcon, SpinnerIcon } from './Icons'

type PillState = 'scanning' | 'ready' | 'error' | 'idle'

interface DownloadPillProps {
  state: PillState
  /** Right-hand label: "Download", "Scanning", the quality, or "Try again". */
  label: string
  onClick: () => void
}

/**
 * Bottom-right download trigger (D050): flat accent pill, 60 px tall,
 * morphs above the bottom strip while a download or player is active.
 */
export function DownloadPill({ state, label, onClick }: DownloadPillProps) {
  return (
    <button type="button" className={`pill pill--${state}`} onClick={onClick} aria-label={label}>
      <span className="pill__core">
        {state === 'scanning' ? (
          <SpinnerIcon className="spin" width={18} height={18} />
        ) : state === 'error' ? (
          <AlertIcon width={18} height={18} />
        ) : (
          <ArrowDownIcon width={18} height={18} />
        )}
      </span>
      <span className="pill__label">{label}</span>
    </button>
  )
}
