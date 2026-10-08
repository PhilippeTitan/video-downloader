import { useCallback, useEffect, useRef, useState } from 'react'
import { connect } from './api'
import type { ApiClient, ApiMode } from './api'
import { onDetection, hasNativeShell, requestNavigation } from './bridge'
import { BottomNav } from './components/BottomNav'
import { DownloadPill } from './components/DownloadPill'
import { DownloadQueue } from './components/DownloadQueue'
import { AlertIcon, DownloadIcon } from './components/Icons'
import { LibraryPanel } from './components/LibraryPanel'
import { ModeChip } from './components/ModeChip'
import { SearchBar } from './components/SearchBar'
import { SourceSheet } from './components/SourceSheet'
import { VideoPanel } from './components/VideoPanel'
import { defaultFormatId, normalizeUrl, resolutionLabel, toNavigationTarget } from './format'
import { useDownloads } from './hooks/useDownloads'
import type { Tab, VideoInfo } from './types'
import './App.css'

export default function App() {
  const [api, setApi] = useState<ApiClient | null>(null)
  const [mode, setMode] = useState<ApiMode | 'connecting'>('connecting')
  const [tab, setTab] = useState<Tab>('home')
  const [url, setUrl] = useState('')
  const [video, setVideo] = useState<VideoInfo | null>(null)
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  // Drives the hero animation. One flip per search keeps the transition from
  // being interrupted by intermediate renders, and dismissing reverses it.
  const [searched, setSearched] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Bumped to invalidate an in-flight analysis when a newer one (or a reset)
  // starts, so racing responses can never clobber fresh state.
  const analyzeSeq = useRef(0)

  const downloads = useDownloads(api, mode)

  // Awaits before touching state so the first render is never blocked.
  const probe = useCallback(async () => {
    const client = await connect()
    setApi(client)
    setMode(client.mode)
  }, [])

  const reconnect = useCallback(async () => {
    setMode('connecting')
    await probe()
  }, [probe])

  useEffect(() => {
    // Deferred a tick so the connection result never updates state during mount.
    const initial = setTimeout(() => void probe(), 0)
    return () => clearTimeout(initial)
  }, [probe])

  // On-device the native browser pane sits BEHIND this UI: once we navigate,
  // the page area must go transparent so live content shows through.
  useEffect(() => {
    const browsing = searched && hasNativeShell()
    document.body.classList.toggle('is-browsing', browsing)
    return () => document.body.classList.remove('is-browsing')
  }, [searched])

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

  // The native shell sniffs playable sources in the browsing WebView and posts
  // them here (see bridge.ts). The address bar keeps the page URL; only the
  // detected source flows into analysis.
  useEffect(() => {
    if (!api) return
    return onDetection((event) => {
      void analyze(event.url)
    })
  }, [api, analyze])

  const download = async (formatId: string) => {
    if (!video) return
    try {
      await downloads.start({ url: video.url, formatId })
      // Send the user straight to the progress view.
      setSheetOpen(false)
      setTab('downloads')
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Could not start that download')
      setSheetOpen(true)
    }
  }

  const handleUrlChange = (next: string) => {
    setUrl(next)
    // Emptying the bar drops back to the idle screen, like clearing a URL bar.
    if (!next.trim() && searched) resetSearch()
  }

  /** Address-bar submit: navigate the browser, don't analyze up front. */
  const submitSearch = () => {
    const target = toNavigationTarget(url)
    if (!target) return

    // Fresh page: drop whatever the previous one left behind.
    analyzeSeq.current += 1
    setAnalyzing(false)
    setVideo(null)
    setSelectedFormatId(null)
    setAnalyzeError(null)
    setSheetOpen(false)
    setSearched(true)

    if (requestNavigation(target)) return

    // No shell (dev browser): open the page in a normal tab, then emulate the
    // detection its sniffer will send on-device so the flow stays explorable.
    window.open(target, '_blank', 'noopener,noreferrer')
    const token = analyzeSeq.current
    window.setTimeout(() => {
      if (analyzeSeq.current !== token) return
      void analyze(target)
    }, 1400)
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

  const chip = <ModeChip mode={mode} api={api} onReconnect={() => void reconnect()} />

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

            <SearchBar
              value={url}
              onChange={handleUrlChange}
              onSubmit={submitSearch}
              busy={analyzing}
            />

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
            ) : (
              <LibraryPanel
                jobs={downloads.finished}
                onRemove={(id) => void downloads.remove(id)}
                onClear={() => void downloads.clearFinished()}
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

      <BottomNav
        tab={tab}
        onChange={(next) => {
          setTab(next)
          // The sheet belongs to the browser screen; don't strand it behind.
          if (next !== 'home') setSheetOpen(false)
        }}
        activeCount={downloads.active.length}
      />
    </div>
  )
}
