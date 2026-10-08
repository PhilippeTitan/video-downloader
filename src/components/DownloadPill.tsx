import { AlertIcon, ArrowDownIcon } from './Icons'

type PillState = 'scanning' | 'ready' | 'error'

interface DownloadPillProps {
  state: PillState
  /** Right-hand label: "Scanning", the picked quality, or "Try again". */
  label: string
  onClick: () => void
}

/**
 * Bottom-right download trigger. The ring shows the detection state:
 * spinning arc while scanning, full ring when a source is ready,
 * alarm styling after a failed read.
 */
export function DownloadPill({ state, label, onClick }: DownloadPillProps) {
  return (
    <button type="button" className={`pill pill--${state}`} onClick={onClick} aria-label={label}>
      <span className="pill__ring">
        <svg className="pill__orbit" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.28)" strokeWidth="2.3" />
          <path
            className="pill__arc"
            d="M12 3a9 9 0 0 1 9 9"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <circle
            className="pill__full"
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.3"
          />
        </svg>
        <span className="pill__core">
          {state === 'ready' && <ArrowDownIcon width={13} height={13} />}
          {state === 'error' && <AlertIcon width={13} height={13} />}
        </span>
      </span>
      <span className="pill__label">{label}</span>
    </button>
  )
}
