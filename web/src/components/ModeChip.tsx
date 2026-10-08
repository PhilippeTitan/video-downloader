import type { ApiClient, ApiMode } from '../api'
import { SpinnerIcon } from './Icons'

interface ModeChipProps {
  mode: ApiMode | 'connecting'
  api: ApiClient | null
  onReconnect: () => void
  className?: string
}

/** Connection state, and the reconnect control. */
export function ModeChip({ mode, api, onReconnect, className }: ModeChipProps) {
  return (
    <button
      type="button"
      className={`mode mode--${mode}${className ? ` ${className}` : ''}`}
      disabled={mode === 'connecting'}
      title={`${api ? api.label : 'Looking for the downloader service'} — tap to reconnect`}
      onClick={onReconnect}
    >
      {mode === 'connecting' ? (
        <>
          <SpinnerIcon className="spin" width={13} height={13} />
          Connecting
        </>
      ) : mode === 'live' ? (
        'Connected'
      ) : (
        'Demo mode'
      )}
    </button>
  )
}
