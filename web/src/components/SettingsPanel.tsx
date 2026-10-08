import { useState } from 'react'
import type { Theme } from '../types'
import { ShareIcon, TrashIcon } from './Icons'

interface SettingsPanelProps {
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onClearBrowsingData: () => void
  onExportAll: () => void
  onClose?: () => void
}

export function SettingsPanel({
  theme,
  onThemeChange,
  onClearBrowsingData,
  onExportAll,
}: SettingsPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard?.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleClear = () => {
    if (window.confirm('Clear all browsing data (cookies, website data, and cache)?')) {
      setClearing(true)
      onClearBrowsingData()
      setTimeout(() => {
        setClearing(false)
        setCleared(true)
        setTimeout(() => setCleared(false), 3000)
      }, 600)
    }
  }

  const appVersion = '1.0.0 (Build 2026.10)'
  const extractorVersion = 'v2026.10.08-bundled'

  return (
    <section className="settings-panel" aria-label="Settings">
      <header className="settings-panel__header">
        <h2 className="settings-panel__title">Settings</h2>
        <p className="settings-panel__subtitle">Preferences &amp; Diagnostics</p>
      </header>

      {/* Theme Section (Q034, Q043) */}
      <div className="settings-card">
        <h3 className="settings-card__label">Appearance</h3>
        <p className="settings-card__desc">Choose interface color mode</p>
        <div className="theme-toggle" role="radiogroup" aria-label="Appearance Theme">
          {(['system', 'dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              className={`theme-toggle__btn ${theme === t ? 'theme-toggle__btn--active' : ''}`}
              onClick={() => onThemeChange(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Version Information (Q055) */}
      <div className="settings-card">
        <h3 className="settings-card__label">System Versions</h3>
        <p className="settings-card__desc">Tap any version to copy for diagnostics</p>
        <div className="settings-row-group">
          <div
            className="settings-row"
            role="button"
            tabIndex={0}
            onClick={() => copyToClipboard('app', appVersion)}
            onKeyDown={(e) => e.key === 'Enter' && copyToClipboard('app', appVersion)}
          >
            <span className="settings-row__label">App Version</span>
            <span className="settings-row__value">
              {appVersion} {copiedKey === 'app' && <span className="settings-row__badge">Copied!</span>}
            </span>
          </div>

          <div
            className="settings-row"
            role="button"
            tabIndex={0}
            onClick={() => copyToClipboard('extractor', extractorVersion)}
            onKeyDown={(e) => e.key === 'Enter' && copyToClipboard('extractor', extractorVersion)}
          >
            <span className="settings-row__label">Extractor Engine</span>
            <span className="settings-row__value">
              {extractorVersion}{' '}
              {copiedKey === 'extractor' && <span className="settings-row__badge">Copied!</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Data & Storage Management (Q055, Q070) */}
      <div className="settings-card">
        <h3 className="settings-card__label">Data &amp; Storage</h3>
        <p className="settings-card__desc">Private on-device storage actions</p>
        <div className="settings-actions">
          <button
            type="button"
            className="settings-btn settings-btn--action"
            onClick={onExportAll}
          >
            <ShareIcon width={18} height={18} />
            <span>Export All Downloads</span>
          </button>

          <button
            type="button"
            className="settings-btn settings-btn--danger"
            disabled={clearing}
            onClick={handleClear}
          >
            <TrashIcon width={18} height={18} />
            <span>{clearing ? 'Clearing...' : cleared ? 'Cleared!' : 'Clear Browsing Data'}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
