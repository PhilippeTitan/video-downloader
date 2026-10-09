import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { connect } from './api'
import type { ApiClient, ApiMode } from './api'
import {
  onDetection,
  hasNativeShell,
  requestNavigation,
  requestSwitchTab,
  requestCloseTab,
  requestNewTab,
  requestReload,
  requestBrowserPane,
  requestShareFile,
  requestClearBrowsingData,
  requestExportAll,
} from './bridge'
import { BottomStrip } from './components/BottomStrip'
import { DownloadPill } from './components/DownloadPill'
import { AlertIcon } from './components/Icons'
import { HomeHero } from './components/HomeHero'
import { MediaPlayerModal } from './components/MediaPlayerModal'
import { ModeChip } from './components/ModeChip'
import { NavRail } from './components/NavRail'
import { ResultsPanel } from './components/ResultsPanel'
import { SearchBar } from './components/SearchBar'
import { SettingsPanel } from './components/SettingsPanel'
import { TabBar } from './components/TabBar'
import { loadFavorites } from './favorites'
import type { Favorite } from './favorites'
import { defaultFormatId, normalizeUrl, resolutionLabel, toNavigationTarget } from './format'
import { clearHistory, loadHistory, syncHistory } from './history'
import type { HistoryEntry } from './history'
import { useDownloads } from './hooks/useDownloads'
import { useSequence } from './hooks/useSequence'
import { loadRecents, pushRecent } from './recents'
import { DownloadsScreen } from './screens/DownloadsScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import type { BrowserTab, DownloadJob, Tab, Theme, VideoInfo } from './types'
import './App.css'

const TAB_STORAGE_KEY = 'vd-tabs-v1'
const THEME_STORAGE_KEY = 'vd-theme-v1'
const PRIVATE_STORAGE_KEY = 'vd-private-v1'
/** load gives the sniffer this long to report before the sequence parks
 *  in the error state (real pages usually detect well inside it). */
const SEQ_NO_DETECTION_MS = 12_000

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
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [playingJob, setPlayingJob] = useState<DownloadJob | null>(null)
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null)

  // Multi-tab state (Q010, Q016, Q046, Q058)
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>(loadSavedTabs)
  const [activeTabId, setActiveTabId] = useState<string>(() => loadSavedTabs()[0]?.id || 'tab-1')

  // Theme state (Q037, Q043, Q093)
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'system'
  })

  // Downloads & Library design state (D009, D010, D017, D046, D047)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [toast, setToast] = useState<{ text: string; sub?: string; toLibrary?: boolean } | null>(null)
  const [pulseJobId, setPulseJobId] = useState<string | null>(null)
  const [freeBytes, setFreeBytes] = useState<number | null>(null)
  const [fly, setFly] = useState<{ id: number; x0: number; y0: number; x1: number; y1: number } | null>(null)
  const prevCompleteIds = useRef<Set<string>>(new Set())
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Home chrome state (Stage D): favorites, recents, private mode (D025)
  const [favorites, setFavorites] = useState<Favorite[]>(loadFavorites)
  const [recents, setRecents] = useState<string[]>(loadRecents)
  const [privateMode, setPrivateMode] = useState(
    () => localStorage.getItem(PRIVATE_STORAGE_KEY) === '1',
  )
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const browserSlotRef = useRef<HTMLDivElement | null>(null)

  const analyzeSeq = useRef(0)
  const downloads = useDownloads(api, mode)

  // Gen-3 sequence machine: pill flight → load gate → results park → return.
  const seq = useSequence({
    onTypingDone: (text) => setUrl(text),
    onScanStart: (text, nav) => (nav ? submitTarget(text) : startAnalyzeOnly(text)),
    onLoadSettled: (text) => {
      if (!privateMode) setRecents(pushRecent(text))
    },
    onReturnStart: () => {
      // Cancel any pending analyze; results stay visible while clipping away.
      analyzeSeq.current += 1
      setAnalyzing(false)
    },
    onIdle: () => resetSearch(),
  })

  // Analyze gate: park the sequence when the real lookup settles. In the
  // native shell the sniffer reports whenever it likes, so wait for activity
  // and only fall through to the error park after the no-detection window.
  useEffect(() => {
    if (seq.phase !== 'load') return
    if (analyzing) return // in-flight: wait for the settle below
    if (video) {
      seq.notifyAnalyzeDone(true)
      return
    }
    if (analyzeError) {
      seq.notifyAnalyzeDone(false)
      return
    }
    const deadline = window.setTimeout(() => {
      setAnalyzeError('No video found on that page')
      seq.notifyAnalyzeDone(false)
    }, SEQ_NO_DETECTION_MS)
    return () => window.clearTimeout(deadline)
  }, [seq.phase, seq.notifyAnalyzeDone, analyzing, video, analyzeError])

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

  const showToast = useCallback((next: { text: string; sub?: string; toLibrary?: boolean }) => {
    setToast(next)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  // Persist private mode across launches (D025, D049)
  useEffect(() => {
    localStorage.setItem(PRIVATE_STORAGE_KEY, privateMode ? '1' : '0')
  }, [privateMode])

  // History log + completion toasts (D009, D010, D048 rehydration).
  // Private downloads stay out of the history log (D025).
  useEffect(() => {
    if (downloads.jobs.length === 0) return
    setHistory(syncHistory(downloads.jobs.filter((j) => !j.isPrivate)))

    const completed = downloads.jobs.filter((j) => j.status === 'complete')
    const fresh = completed.filter((j) => !prevCompleteIds.current.has(j.id))
    // Seed the seen-set on first load so rehydrated jobs don't spam toasts.
    if (prevCompleteIds.current.size === 0 && fresh.length > 0 && !fresh.some((j) => j.completedAt && Date.now() - j.completedAt < 60_000)) {
      for (const j of completed) prevCompleteIds.current.add(j.id)
      return
    }
    if (fresh.length > 0) {
      for (const j of fresh) prevCompleteIds.current.add(j.id)
      showToast(
        fresh.length === 1
          ? { text: 'Saved to Library · Play', sub: fresh[0].title, toLibrary: true }
          : { text: `Saved ${fresh.length} files to Library`, toLibrary: true },
      )
    }
  }, [downloads.jobs, showToast])

  // Free-space guard data (Q090, D007, D018): native container free bytes,
  // with a navigator.storage.estimate fallback inside LocalEngine (demo).
  useEffect(() => {
    if (!api) return
    let alive = true
    const unsubscribe = api.onStorage((snapshot) => {
      if (alive && snapshot.freeBytes !== null) setFreeBytes(snapshot.freeBytes)
    })
    void api.requestStorageInfo()
    const timer = setInterval(() => void api.requestStorageInfo(), 60_000)
    return () => {
      alive = false
      unsubscribe()
      clearInterval(timer)
    }
  }, [api])

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
    setUrl('')
    setVideo(null)
    setSelectedFormatId(null)
    setAnalyzeError(null)
    setDownloadError(null)
  }, [])

  // Listen for sniffed sources from shell (Q006, Q046). Only the active
  // sequence load gate consumes detections — stray reports are ignored.
  useEffect(() => {
    if (!api) return
    return onDetection((event) => {
      // If event has tabId and doesn't match active tab, ignore (Q046)
      if (event.tabId && event.tabId !== activeTabId) return
      if (seq.phase !== 'load') return
      void analyze(event.url)
    })
  }, [api, analyze, activeTabId, seq.phase])

  const submitTarget = (targetUrl: string) => {
    const target = toNavigationTarget(targetUrl)
    if (!target) return

    analyzeSeq.current += 1
    setAnalyzing(false)
    setVideo(null)
    setSelectedFormatId(null)
    setAnalyzeError(null)
    setDownloadError(null)
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

  /** nav=false: the page is already loaded (tab switch) — just re-read it. */
  const startAnalyzeOnly = (targetUrl: string) => {
    const target = toNavigationTarget(targetUrl)
    if (!target) return
    analyzeSeq.current += 1
    setAnalyzing(false)
    setVideo(null)
    setSelectedFormatId(null)
    setAnalyzeError(null)
    setDownloadError(null)
    setSearched(true)
    setClipboardUrl(null)
    void analyze(target)
  }

  const submitSearch = () => {
    if (!toNavigationTarget(url)) return
    // Parked pill + Enter: re-run the lookup in place (no new flight).
    if (seq.phase === 'done' || seq.phase === 'error') {
      seq.reload(url)
      return
    }
    seq.submit(url)
  }

  // Free-space check guard before download (Q090)
  const download = async (formatId: string) => {
    if (!video) return

    // Storage warning check (< 1 GB floor) against native free space (D018)
    if (freeBytes !== null && freeBytes < 1024 * 1024 * 1024) {
      const proceed = window.confirm(
        'Storage space is running low (< 1 GB free). Download anyway?',
      )
      if (!proceed) return
    }

    try {
      setDownloadError(null)
      await downloads.start({
        url: video.url,
        formatId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        durationSec: video.durationSec,
        private: privateMode,
      })
      // Sweep the whole session back home; the chip flies to the rail below.
      seq.downloadStarted()
      // D046: chip flies from the panel to the rail's Downloads icon,
      // badge bumps — user stays put and watches (no forced screen jump).
      const railEl = document.getElementById('rail-downloads')
      const reduceMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (railEl && !reduceMotion) {
        const rail = railEl.getBoundingClientRect()
        setFly({
          id: Date.now(),
          x0: window.innerWidth / 2,
          y0: window.innerHeight * 0.7,
          x1: rail.left + rail.width / 2,
          y1: rail.top + rail.height / 2,
        })
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not start that download')
    }
  }

  const handleUrlChange = (next: string) => {
    setUrl(next)
    if (!next.trim() && seq.phase !== null) seq.dismiss()
  }

  // Tab management actions (Q010, Q016, Q046) — index order mirrors the
  // native tab list (web is the source of truth for ordering).
  const handleSelectTab = (id: string) => {
    setActiveTabId(id)
    const targetTab = browserTabs.find((t) => t.id === id)
    if (!targetTab) return
    // Kill any running session, then choreograph the switch: a loaded tab
    // flies straight into load (nav=false — the page is already there).
    seq.cancelJumpCut()
    if (targetTab.url) {
      const index = browserTabs.findIndex((t) => t.id === id)
      if (index >= 0) requestSwitchTab(index)
      seq.submit(targetTab.url, false)
    } else {
      resetSearch()
    }
  }

  const handleCloseTab = (id: string) => {
    if (browserTabs.length <= 1) return
    const closeIndex = browserTabs.findIndex((t) => t.id === id)
    if (closeIndex >= 0) requestCloseTab(closeIndex)
    const nextTabs = browserTabs.filter((t) => t.id !== id)
    setBrowserTabs(nextTabs)

    if (activeTabId === id) {
      const fallback = nextTabs[nextTabs.length - 1]
      handleSelectTab(fallback.id)
    }
  }

  const handleNewTab = () => {
    if (browserTabs.length >= 10) return
    const newId = `tab-${Date.now()}`
    const newTabObj: BrowserTab = { id: newId, url: '', title: 'New Tab' }
    seq.cancelJumpCut()
    setBrowserTabs((prev) => [...prev, newTabObj])
    setActiveTabId(newId)
    setUrl('')
    resetSearch()
    requestNewTab()
  }

  // Long-press menu "Refresh" (Q058): reload the active tab's page natively
  // and re-run the lookup without a fresh flight (nav=false).
  const handleRefreshTab = (id: string) => {
    if (id !== activeTabId) return
    const targetTab = browserTabs.find((t) => t.id === id)
    if (!targetTab?.url) return
    requestReload()
    seq.reload(targetTab.url, false)
  }

  const shellMode = hasNativeShell()
  const seqPhase = seq.phase
  const homePillVisible = tab === 'home'
  // Park window: pill parked at top, TabBar + status + results live here.
  const parkWindow = seqPhase === 'load' || seqPhase === 'done' || seqPhase === 'error' || seqPhase === 'rdown'

  // Safari-style content pane: while the sequence parks in load, the native
  // shell lifts the browsing WebView ABOVE the chrome to exactly the slot's
  // rect, so the page renders inside a framed pane instead of behind the UI.
  // Outside that window it stays fullscreen behind us. Re-sent on
  // resize/scroll (chrome coords can drift) and on tab switches.
  const paneOn = shellMode && tab === 'home' && seqPhase === 'load'
  useEffect(() => {
    if (!paneOn) {
      requestBrowserPane(null)
      return
    }
    const send = () => {
      const rect = browserSlotRef.current?.getBoundingClientRect()
      if (!rect || rect.width < 1 || rect.height < 1) return
      requestBrowserPane({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
    }
    send()
    const raf = requestAnimationFrame(send)
    window.addEventListener('resize', send)
    window.addEventListener('scroll', send, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', send)
      window.removeEventListener('scroll', send, true)
      requestBrowserPane(null)
    }
  }, [paneOn, activeTabId])
  // Home stack (brand + tiles) is mounted unless the park hides it.
  const stackMounted =
    seqPhase === null ||
    seqPhase === 'fade' ||
    seqPhase === 'scan' ||
    seqPhase === 'rdown' ||
    seqPhase === 'rup' ||
    seqPhase === 'rfade'
  const heroState =
    seqPhase === null ? (searched ? 'active' : 'idle') : seqPhase === 'fade' || seqPhase === 'scan' ? 'idle' : 'active'
  const heroExtra =
    seqPhase !== null && parkWindow
      ? ' hero--parked'
      : seqPhase === 'fade' || seqPhase === 'scan'
        ? ' hero--flying'
        : ''
  const statusText =
    seqPhase === 'load'
      ? 'Scanning for sources…'
      : seqPhase === 'error'
        ? 'Couldn\u2019t read that link'
        : video
          ? 'Source found — pick a format'
          : null
  const pillState: 'scanning' | 'ready' | 'error' | 'idle' =
    seqPhase === 'load' || analyzing
      ? 'scanning'
      : analyzeError
        ? 'error'
        : video
          ? 'ready'
          : 'idle'
  const selectedFormat = video?.formats.find((format) => format.id === selectedFormatId)
  const pillLabel =
    pillState === 'error'
      ? 'Try again'
      : pillState === 'ready' && selectedFormat
        ? resolutionLabel(selectedFormat)
        : pillState === 'ready' || pillState === 'idle'
          ? 'Download'
          : 'Scanning'
  const stripJob = downloads.active[0] ?? null
  const stripVisible = tab === 'home' && (stripJob !== null || playingJob !== null)

  const chip = (
    <ModeChip
      mode={mode}
      api={api}
      onReconnect={() => {
        void probe()
      }}
    />
  )

  // ---- Downloads / Library interactions (D-ledger) ----

  const markPlayed = (job: DownloadJob) => {
    setPlayingJob(job)
    if (!job.playedAt) void api?.updateJob(job.id, { playedAt: Date.now() })
  }

  const shareJob = (job: DownloadJob) => {
    if (!requestShareFile(job.filePath || job.url, job.title)) {
      navigator.share?.({ title: job.title, url: job.filePath || job.url }).catch(() => {})
    }
  }

  const openSourceInNewTab = (srcUrl: string) => {
    const target = toNavigationTarget(srcUrl)
    if (!target || browserTabs.length >= 10) return
    const newId = `tab-${Date.now()}`
    seq.cancelJumpCut()
    setBrowserTabs((prev) => [...prev, { id: newId, url: target, title: target }])
    setActiveTabId(newId)
    setTab('home')
    requestNewTab()
    // Full choreography: scan → load fires requestNavigation for the new tab.
    seq.submit(target)
  }

  const gotoLibrary = (jobId?: string) => {
    seq.cancelJumpCut()
    setTab('library')
    if (jobId) setPulseJobId(jobId)
  }

  const busyIds = downloads.jobs
    .filter((j) => j.status === 'downloading' || j.status === 'converting' || j.status === 'queued')
    .map((j) => j.id)
  const pausedIds = downloads.jobs.filter((j) => j.status === 'paused').map((j) => j.id)

  const hasFailed = downloads.jobs.some((j) => j.status === 'error')
  const libNewDot = downloads.jobs.some(
    (j) => j.status === 'complete' && !j.playedAt && !j.isPrivate,
  )

  // Auto-clear the library pulse after it plays once (D020 re-entry guard)
  useEffect(() => {
    if (!pulseJobId) return
    const t = setTimeout(() => setPulseJobId(null), 3500)
    return () => clearTimeout(t)
  }, [pulseJobId])

  return (
    <>
      <NavRail
        tab={tab}
        onChange={(next) => {
          if (next !== 'home') seq.cancelJumpCut()
          setTab(next)
        }}
        activeCount={downloads.active.length}
        hasFailed={hasFailed}
        libNewDot={libNewDot}
      />

      <div
        className={`app${tab === 'downloads' || tab === 'library' ? ' app--full' : ''}${homePillVisible ? ' app--pill' : ''}`}
      >
        <main className="app__main">
        {downloads.error && (
          <div className="alert" role="alert">
            <AlertIcon width={17} height={17} />
            <span>{downloads.error}</span>
          </div>
        )}

        {tab === 'home' ? (
          <section
            ref={seq.stageRef}
            className={`hero hero--${heroState}${heroExtra}`}
          >
            {chip}

            {/* Idle hero stack: brand + favorites/recents, or private card.
                Stays mounted through the return sweep so it can fade back in. */}
            {stackMounted && (
              <HomeHero
                favorites={favorites}
                recents={recents}
                privateMode={privateMode}
                launched={seq.text}
                dimOp={seq.dimOp}
                onLaunchFavorite={(fav) => seq.launch(fav.url)}
                onLaunchRecent={(text) => seq.launch(text)}
                onFavoritesChange={setFavorites}
              />
            )}

            {/* Multi-Tab Strip (Q010, Q016) — parked only (top park slot). */}
            {parkWindow && (
              <TabBar
                tabs={browserTabs}
                activeTabId={activeTabId}
                onSelectTab={handleSelectTab}
                onCloseTab={handleCloseTab}
                onNewTab={handleNewTab}
                onRefreshTab={handleRefreshTab}
              />
            )}

            <SearchBar
              value={seqPhase === 'fade' ? seq.typed : url}
              onChange={handleUrlChange}
              onSubmit={submitSearch}
              busy={seqPhase === 'load' || seqPhase === 'done'}
              inputRef={searchInputRef}
            />

            {/* Clipboard banner if URL found (Q026) — idle only. */}
            {seqPhase === null && !searched && clipboardUrl && (
              <div
                className="clipboard-banner"
                role="button"
                tabIndex={0}
                onClick={() => {
                  seq.launch(clipboardUrl)
                }}
              >
                <span className="clipboard-banner__text">
                  Copied link: <strong>{clipboardUrl}</strong>
                </span>
                <span className="clipboard-banner__action">Open</span>
              </div>
            )}

            {/* Sequence status line (parked under the pill). */}
            {parkWindow && statusText && <p className="seq-status">{statusText}</p>}

            {/* Framed content pane: anchor for the native browser rect while
                the sequence loads. The native webview is lifted above the
                chrome to exactly this box; results take the same box after. */}
            {parkWindow && (
              <div className="browser-slot" ref={browserSlotRef} aria-hidden="true">
                {!shellMode && seqPhase === 'load' && (
                  <p className="browser-slot__hint">
                    The live page renders here inside the app.
                  </p>
                )}
              </div>
            )}

            {/* Choreographed results: formats, CTA, errors, dev stub. */}
            {(seqPhase === 'done' || seqPhase === 'error' || seqPhase === 'rdown') && (
              <ResultsPanel
                phase={seqPhase}
                video={video}
                selectedFormatId={selectedFormatId}
                error={analyzeError}
                downloadError={downloadError}
                hasShell={shellMode}
                onSelect={setSelectedFormatId}
                onDownload={(formatId) => void download(formatId)}
                onRetry={() => seq.retry()}
                onDismiss={() => seq.dismiss()}
              />
            )}
          </section>
        ) : tab === 'downloads' ? (
          <DownloadsScreen
            jobs={downloads.jobs}
            history={history}
            freeBytes={freeBytes}
            onGoHome={() => setTab('home')}
            onGoLibrary={gotoLibrary}
            onCancel={(id) => void downloads.cancel(id)}
            onRemove={(id) => void downloads.remove(id)}
            onPause={(id) => void downloads.pause(id)}
            onResume={(id) => void downloads.resume(id)}
            onRetry={(id) => void downloads.retry(id)}
            onUseCellular={(id) => void api?.updateJob(id, { waitingForWifi: false })}
            onPauseAll={() => {
              for (const id of busyIds) void downloads.pause(id)
            }}
            onResumeAll={() => {
              for (const id of pausedIds) void downloads.resume(id)
            }}
            onCancelAll={() => {
              for (const id of busyIds) void downloads.cancel(id)
            }}
            onClearFailed={() => void downloads.clearFailed()}
            onPlay={markPlayed}
            onClearHistory={() => {
              clearHistory()
              setHistory([])
            }}
          />
        ) : tab === 'library' ? (
          <LibraryScreen
            jobs={downloads.jobs}
            freeBytes={freeBytes}
            pulseJobId={pulseJobId}
            onGoHome={() => setTab('home')}
            onPlay={markPlayed}
            onShare={shareJob}
            onDelete={(id) => void downloads.remove(id)}
            onExportAll={() => requestExportAll()}
            onOpenSource={openSourceInNewTab}
          />
        ) : (
          <>
            <div className="screen-top">{chip}</div>
            <SettingsPanel
              theme={theme}
              onThemeChange={setTheme}
              privateMode={privateMode}
              onPrivateModeChange={setPrivateMode}
              onClearBrowsingData={() => {
                requestClearBrowsingData()
                localStorage.removeItem(TAB_STORAGE_KEY)
                setBrowserTabs([{ id: 'tab-1', url: '', title: 'Start' }])
              }}
              onExportAll={() => {
                requestExportAll()
              }}
            />
          </>
        )}
      </main>

      {tab === 'home' && homePillVisible && (
        <div
          className={`pill-layer${stripVisible ? ' pill-layer--raised' : ''}${seq.flying ? ' pill-layer--seq-hidden' : ''}`}
        >
          <DownloadPill
            state={pillState}
            label={pillLabel}
            onClick={() => {
              if (pillState === 'error') seq.retry()
              else if (pillState === 'ready' && selectedFormat) void download(selectedFormat.id)
              else if (pillState === 'idle') searchInputRef.current?.focus()
            }}
          />
        </div>
      )}

        {/* Live download / now-playing strip (design section K) */}
        {stripVisible && (
          <BottomStrip
            active={stripJob}
            playing={playingJob}
            onTap={() => {
              if (playingJob) setPlayingJob(null)
              else setTab('downloads')
            }}
          />
        )}

        {/* In-app Media Player Modal (Q041, Q053, Q054) */}
        <MediaPlayerModal
          job={playingJob}
          onClose={() => setPlayingJob(null)}
          onProgress={(id, frac) => void api?.updateJob(id, { playbackProgress: frac })}
        />
      </div>

      {/* Completion toast (D010) */}
      {toast && (
        <button
          type="button"
          className="toast"
          onClick={() => {
            if (toast.toLibrary) gotoLibrary()
            setToast(null)
          }}
        >
          <span className="toast__text">{toast.text}</span>
          {toast.sub && <span className="toast__sub">{toast.sub}</span>}
        </button>
      )}

      {/* Fly-to-rail chip (D046) */}
      {fly && (
        <span
          key={fly.id}
          className="flydot"
          style={
            {
              '--fx': `${fly.x0}px`,
              '--fy': `${fly.y0}px`,
              '--tx': `${fly.x1}px`,
              '--ty': `${fly.y1}px`,
            } as CSSProperties
          }
          onAnimationEnd={() => setFly(null)}
        />
      )}
    </>
  )
}
