import { useCallback, useEffect, useRef, useState } from 'react'
import { connect } from './api'
import type { ApiClient, ApiMode } from './api'
import {
  onDetection,
  hasNativeShell,
  requestNavigation,
  requestSwitchTab,
  requestCloseTab,
  requestNewTab,
  requestShareFile,
  requestClearBrowsingData,
  requestExportAll,
} from './bridge'
import { BottomNav } from './components/BottomNav'
import { DownloadPill } from './components/DownloadPill'
import { DownloadQueue } from './components/DownloadQueue'
import { AlertIcon, DownloadIcon } from './components/Icons'
import { LibraryPanel } from './components/LibraryPanel'
import { MediaPlayerModal } from './components/MediaPlayerModal'
import { ModeChip } from './components/ModeChip'
import { SearchBar } from './components/SearchBar'
import { SettingsPanel } from './components/SettingsPanel'
import { ShortcutTiles } from './components/ShortcutTiles'
import { SourceSheet } from './components/SourceSheet'
import { TabBar } from './components/TabBar'
import { VideoPanel } from './components/VideoPanel'
import { defaultFormatId, normalizeUrl, resolutionLabel, toNavigationTarget } from './format'
import { useDownloads } from './hooks/useDownloads'
import type { BrowserTab, DownloadJob, Tab, Theme, VideoInfo } from './types'
import './App.css'

const TAB_STORAGE_KEY = 'vd-tabs-v1'
const THEME_STORAGE_KEY = 'vd-theme-v1'

function loadSavedTabs(): BrowserTab[] {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    /* fallback */
  }
  return [{ id: 'tab-1', url: '', title: 'Start' }]
}

function saveTabs(tabs: BrowserTab[]) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabs))
  } catch {
    /* quota */
  }
}

export default function App() {
  const [api, setApi] = useState<ApiClient | null>(null)
  const [mode, setMode] = useState<ApiMode | 'connecting'>('connecting')
  const [tab, setTab] = useState<Tab>('home')
  const [url, setUrl] = useState('')
  const [video, setVideo] = useState<VideoInfo | null>(null)
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [playingJob, setPlayingJob] = useState<DownloadJob | null>(null)
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null)

  // Multi-tab state (Q010, Q016, Q046, Q058)
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>(loadSavedTabs)
  const [activeTabId, setActiveTabId] = useState<string>(() => loadSavedTabs()[0]?.id || 'tab-1')

  // Theme state (Q037, Q043, Q093)
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'system'
  })

  const analyzeSeq = useRef(0)
  const downloads = useDownloads(api, mode)

  // Apply theme to DOM
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  // Save browser tabs across restarts (Q016)
  useEffect(() => {
    saveTabs(browserTabs)
  }, [browserTabs])

  // Connect local engine
  const probe = useCallback(async () => {
    const client = await connect()
    setApi(client)
    setMode(client.mode)
  }, [])

  useEffect(() => {
    const initial = setTimeout(() => void probe(), 0)
    return () => clearTimeout(initial)
  }, [probe])

  // Transparent background when browsing in native shell
  useEffect(() => {
    const browsing = searched && hasNativeShell()
    document.body.classList.toggle('is-browsing', browsing)
    return () => document.body.classList.remove('is-browsing')
  }, [searched])

  // Clipboard detection on mount/foreground (Q026)
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        if (!searched && !url && navigator.clipboard?.readText) {
          const text = await navigator.clipboard.readText()
          if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
            setClipboardUrl(text.trim())
          }
        }
      } catch {
        /* clipboard access permission denied */
      }
    }
    checkClipboard()
    window.addEventListener('focus', checkClipboard)
    return () => window.removeEventListener('focus', checkClipboard)
  }, [searched, url])

  const analyze = useCallback(
    async (target?: string) => {
      if (!api) return
      const seq = ++analyzeSeq.current
      setSearched(true)
      setAnalyzing(true)
      setAnalyzeError(null)
      setVideo(null)
      setSelectedFormatId(null)
      try {
        const info = await api.analyze(normalizeUrl(target ?? url))
        if (seq !== analyzeSeq.current) return
        setVideo(info)
        setSelectedFormatId(defaultFormatId(info.formats) ?? null)
      } catch (err) {
        if (seq !== analyzeSeq.current) return
        setAnalyzeError(err instanceof Error ? err.message : 'Could not read that link')
      } finally {
        if (seq === analyzeSeq.current) setAnalyzing(false)
      }
    },
    [api, url],
  )

  const resetSearch = useCallback(() => {
    analyzeSeq.current += 1
    setAnalyzing(false)
    setSearched(false)
    setSheetOpen(false)
    setUrl('')
    setVideo(null)
    setSelectedFormatId(null)
    setAnalyzeError(null)
  }, [])

  // Listen for sniffed sources from shell (Q006, Q046)
  useEffect(() => {
    if (!api) return
    return onDetection((event) => {
      // If event has tabId and doesn't match active tab, ignore (Q046)
      if (event.tabId && event.tabId !== activeTabId) return
      void analyze(event.url)
    })
  }, [api, analyze, activeTabId])

  const submitTarget = (targetUrl: string) => {
    const target = toNavigationTarget(targetUrl)
    if (!target) return

    analyzeSeq.current += 1
    setAnalyzing(false)
    setVideo(null)
    setSelectedFormatId(null)
    setAnalyzeError(null)
    setSheetOpen(false)
    setSearched(true)
    setClipboardUrl(null)

    // Update active tab URL
    setBrowserTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, url: target, title: target } : t)),
    )

    if (requestNavigation(target)) return

    // Dev fallback
    window.open(target, '_blank', 'noopener,noreferrer')
    const token = analyzeSeq.current
    window.setTimeout(() => {
      if (analyzeSeq.current !== token) return
      void analyze(target)
    }, 1400)
  }

  const submitSearch = () => {
    submitTarget(url)
  }

  // Free-space check guard before download (Q090)
  const download = async (formatId: string) => {
    if (!video) return

    // Storage warning check (< 1 GB floor)
    if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage?.estimate) {
      try {
        const { quota, usage } = await navigator.storage.estimate()
        if (quota && usage && quota - usage < 1024 * 1024 * 1024) {
          const proceed = window.confirm(
            'Storage space is running low (< 1 GB free). Download anyway?',
          )
          if (!proceed) return
        }
      } catch {
        /* storage estimate unavailable */
      }
    }

    try {
      await downloads.start({ url: video.url, formatId })
      setSheetOpen(false)
      setTab('downloads')
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Could not start that download')
      setSheetOpen(true)
    }
  }

  const handleUrlChange = (next: string) => {
    setUrl(next)
    if (!next.trim() && searched) resetSearch()
  }

  // Tab management actions (Q010, Q016, Q046)
  const handleSelectTab = (id: string) => {
    setActiveTabId(id)
    const targetTab = browserTabs.find((t) => t.id === id)
    if (targetTab) {
      setUrl(targetTab.url)
      if (targetTab.url) {
        setSearched(true)
        requestSwitchTab(id)
      } else {
        resetSearch()
      }
    }
  }

  const handleCloseTab = (id: string) => {
    if (browserTabs.length <= 1) return
    const nextTabs = browserTabs.filter((t) => t.id !== id)
    setBrowserTabs(nextTabs)
    requestCloseTab(id)

    if (activeTabId === id) {
      const fallback = nextTabs[nextTabs.length - 1]
      handleSelectTab(fallback.id)
    }
  }

  const handleNewTab = () => {
    if (browserTabs.length >= 10) return
    const newId = `tab-${Date.now()}`
    const newTabObj: BrowserTab = { id: newId, url: '', title: 'New Tab' }
    setBrowserTabs((prev) => [...prev, newTabObj])
    setActiveTabId(newId)
    setUrl('')
    resetSearch()
    requestNewTab()
  }

  const heroActive = searched
  const shellMode = hasNativeShell()
  const pillVisible = tab === 'home' && searched
  const pillState = analyzing ? 'scanning' : analyzeError ? 'error' : video ? 'ready' : 'scanning'
  const selectedFormat = video?.formats.find((format) => format.id === selectedFormatId)
  const pillLabel =
    pillState === 'error'
      ? 'Try again'
      : pillState === 'ready' && selectedFormat
        ? resolutionLabel(selectedFormat)
        : pillState === 'ready'
          ? 'Download'
          : 'Scanning'
  const hint = analyzing
    ? 'Scanning for sources…'
    : video
      ? 'Source found — tap the pill to view formats'
      : null
  const sheetTitle = analyzing
    ? 'Scanning…'
    : analyzeError
      ? 'Couldn\u2019t read that link'
      : 'Detected source'

  const chip = (
    <ModeChip
      mode={mode}
      api={api}
      onReconnect={() => {
        void probe()
      }}
    />
  )

  return (
    <div className={`app${pillVisible ? ' app--pill' : ''}`}>
      <main className="app__main">
        {downloads.error && (
          <div className="alert" role="alert">
            <AlertIcon width={17} height={17} />
            <span>{downloads.error}</span>
          </div>
        )}

        {tab === 'home' ? (
          <section className={`hero hero--${heroActive ? 'active' : 'idle'}`}>
            {chip}

            <div className="hero__brand">
              <span className="hero__mark">
                <DownloadIcon />
              </span>
              <span className="hero__wordmark">Video Downloader</span>
            </div>

            {/* Multi-Tab Strip (Q010, Q016) */}
            {searched && (
              <TabBar
                tabs={browserTabs}
                activeTabId={activeTabId}
                onSelectTab={handleSelectTab}
                onCloseTab={handleCloseTab}
                onNewTab={handleNewTab}
              />
            )}

            <SearchBar
              value={url}
              onChange={handleUrlChange}
              onSubmit={submitSearch}
              busy={analyzing}
            />

            {/* Clipboard banner if URL found (Q026) */}
            {!searched && clipboardUrl && (
              <div
                className="clipboard-banner"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setUrl(clipboardUrl)
                  submitTarget(clipboardUrl)
                }}
              >
                <span className="clipboard-banner__text">
                  Copied link: <strong>{clipboardUrl}</strong>
                </span>
                <span className="clipboard-banner__action">Open</span>
              </div>
            )}

            {/* Start Page Site Shortcuts (Q008, Q038) */}
            {!searched && (
              <ShortcutTiles
                onSelect={(target) => {
                  setUrl(target)
                  submitTarget(target)
                }}
              />
            )}

            {pillVisible && !shellMode && (
              <div className="card browser-stub">
                <div className="card__head">
                  <span className="card__title">In-app browser</span>
                  <span className="badge badge--dim">Preview</span>
                </div>
                <p className="browser-stub__text">
                  Live pages render here inside the iOS app. Without the shell this preview
                  opened your link in a new tab instead — on-device the sniffer watches the
                  page and reports videos to the pill.
                </p>
              </div>
            )}

            {pillVisible &&
              !sheetOpen &&
              (analyzeError ? (
                <div className="alert" role="alert">
                  <AlertIcon width={17} height={17} />
                  <span>{analyzeError}</span>
                </div>
              ) : hint ? (
                <p className="detect-hint">{hint}</p>
              ) : null)}
          </section>
        ) : (
          <>
            <div className="screen-top">{chip}</div>
            {tab === 'downloads' ? (
              <DownloadQueue
                jobs={downloads.active}
                onCancel={(id) => void downloads.cancel(id)}
                onRemove={(id) => void downloads.remove(id)}
              />
            ) : tab === 'downloaded' ? (
              <LibraryPanel
                jobs={downloads.finished}
                onRemove={(id) => void downloads.remove(id)}
                onClear={() => void downloads.clearFinished()}
                onPlay={(job) => setPlayingJob(job)}
                onShare={(job) => {
                  if (!requestShareFile(job.filePath || job.url, job.title)) {
                    navigator.share?.({ title: job.title, url: job.filePath || job.url }).catch(() => {})
                  }
                }}
              />
            ) : (
              <SettingsPanel
                theme={theme}
                onThemeChange={setTheme}
                onClearBrowsingData={() => {
                  requestClearBrowsingData()
                  localStorage.removeItem(TAB_STORAGE_KEY)
                  setBrowserTabs([{ id: 'tab-1', url: '', title: 'Start' }])
                }}
                onExportAll={() => {
                  requestExportAll()
                }}
              />
            )}
          </>
        )}
      </main>

      {pillVisible && (
        <>
          <div className="pill-layer">
            <DownloadPill
              state={pillState}
              label={pillLabel}
              onClick={() => {
                if (pillState === 'error') void analyze()
                else setSheetOpen(true)
              }}
            />
          </div>

          <SourceSheet open={sheetOpen} title={sheetTitle} onClose={() => setSheetOpen(false)}>
            {analyzing && (
              <div className="card skeleton" aria-hidden="true">
                <div className="skeleton__row">
                  <span className="sk sk--thumb" />
                  <span className="skeleton__col">
                    <span className="sk sk--line" />
                    <span className="sk sk--line sk--short" />
                  </span>
                </div>
                <span className="sk sk--block" />
                <span className="sk sk--block" />
              </div>
            )}

            {analyzeError && (
              <>
                <div className="alert" role="alert">
                  <AlertIcon width={17} height={17} />
                  <span>{analyzeError}</span>
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={() => void analyze()}
                >
                  Retry
                </button>
              </>
            )}

            {video && (
              <>
                <VideoPanel
                  key={video.id}
                  video={video}
                  selectedId={selectedFormatId}
                  onSelect={setSelectedFormatId}
                  onDismiss={resetSearch}
                />
                {selectedFormat && (
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    onClick={() => void download(selectedFormat.id)}
                  >
                    Download {resolutionLabel(selectedFormat)} ·{' '}
                    {selectedFormat.ext.toUpperCase()}
                  </button>
                )}
              </>
            )}
          </SourceSheet>
        </>
      )}

      {/* In-app Media Player Modal (Q041, Q053, Q054) */}
      <MediaPlayerModal job={playingJob} onClose={() => setPlayingJob(null)} />

      <BottomNav
        tab={tab}
        onChange={(next) => {
          setTab(next)
          if (next !== 'home') setSheetOpen(false)
        }}
        activeCount={downloads.active.length}
      />
    </div>
  )
}
