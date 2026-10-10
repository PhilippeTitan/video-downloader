import React from 'react'

interface FavItem {
  label: string
  letter: string
  url: string
  bg: string
  ink: string
}

interface LibItem {
  id: string
  title: string
  fmt: string
  size: string
  when: string
  dur: string
  audio: boolean
  mb: number
  isNew?: boolean
  src: string
  prog?: number
  priv?: boolean
  missing?: boolean
  real?: number
}

interface JobItem {
  id: number
  title: string
  fmtLabel: string
  pct: number
  speedBps?: number
  status: 'downloading' | 'done' | 'paused' | 'failed'
  src?: string
  audio?: boolean
}

interface TabItem {
  id: number
  text: string
  priv?: boolean
}

interface SeqState {
  key: string
  text: string
  phase: 'fade' | 'scan' | 'load' | 'done' | 'rdown' | 'rup' | 'rfade'
  t0?: number
  skip?: boolean
}

interface FormatOption {
  id: string
  label: string
  meta: string
}

interface DetectedVideo {
  url: string
  title: string
  thumbnail?: string
  durationSec?: number
  formats: FormatOption[]
}

interface DhRow {
  title: string
  fmt: string
  when: string
  status: string
  ink: string
}

interface AppState {
  sc: Record<string, { t: number; h: number; c: number; at: number }>
  scv: number
  dh: boolean
  dhc: boolean
  dhRows: DhRow[]
  lf: number
  ld: string | null
  dr: string[]
  lib: LibItem[]
  dp: string[]
  dx: string | null
  dm: boolean
  dmc: boolean
  cell: string[]
  lm: boolean
  lay: 'list' | 'cards'
  lq: string
  hmenu: string | null
  sel: boolean
  selIds: string[]
  selConf: boolean
  stOpen: boolean
  info: string | null
  swm: boolean
  pm: boolean
  pmp: number
  cpriv: boolean
  pv: number
  tmc: boolean
  caOn: boolean
  cax: number
  tm: boolean
  tmp: number
  dw: boolean
  dwp: number
  hb: number
  ci: number
  tsp: number
  tsph: string
  sf: number
  pa: number
  pb: number
  nph: string
  npp: number
  cl: { id: string } | null
  cf: number
  pt: number
  nz: { x: number; y: number; w: number; h: number; base: any } | null
  nzph: string
  nzp: number
  nzf: number
  hist: string[]
  hm: boolean
  hmp: number
  hop: number
  screen: 'browse' | 'down' | 'lib'
  sheet: boolean
  fmt: string
  jobs: JobItem[]
  playing: string
  playingMedia: { url: string; title: string; audio: boolean } | null
  seq: SeqState | null
  sp: number
  q: string
  tabs: TabItem[]
  sw: boolean
  swp: number
  swt: number
  adding: boolean
  mp: number
  gp: number
  pick: number
  newId: string
  fx: number
  rx: number
  favs: FavItem[]
  scale: number
  rt?: number
  detectedVideo: DetectedVideo | null
  webviewSrc: string
  webviewUrl: string
}

const STORAGE_KEY_LIB = 'vd-downloads-v1'
const STORAGE_KEY_HIST = 'vd-visited-v1'
const STORAGE_KEY_FAVS = 'vd-favs-v1'
const STORAGE_KEY_DH = 'vd-dl-history-v1'

const DEFAULT_FAVS: FavItem[] = [
  { label: 'YouTube', letter: 'Y', url: 'youtube.com', bg: '#2d2a55', ink: '#b7a6ff' },
  { label: 'TikTok', letter: 'T', url: 'tiktok.com', bg: '#2d2a55', ink: '#b7a6ff' },
  { label: 'Instagram', letter: 'I', url: 'instagram.com', bg: '#2d2a55', ink: '#b7a6ff' },
  { label: 'X', letter: 'X', url: 'x.com', bg: '#2d2a55', ink: '#b7a6ff' },
]

const DEFAULT_LIB: LibItem[] = [
  {
    id: 'l1',
    title: 'Big Buck Bunny (Open Source 4K)',
    fmt: '1080p · MP4',
    size: '158 MB',
    when: 'Today',
    dur: '9:56',
    audio: false,
    mb: 158,
    isNew: true,
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    id: 'l2',
    title: 'Elephants Dream Sci-Fi',
    fmt: '720p · MP4',
    size: '84 MB',
    when: 'Today',
    dur: '10:53',
    audio: false,
    mb: 84,
    isNew: true,
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    id: 'l3',
    title: 'Tears of Steel VFX',
    fmt: '1080p · MP4',
    size: '120 MB',
    when: 'Yesterday',
    dur: '12:14',
    audio: false,
    mb: 120,
    prog: 35,
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
]

export default class App extends React.Component<{}, AppState> {
  t: any = null
  rtick: any = null
  tick: any = null
  dr: Record<string, boolean> = {}
  act: Record<string, number> = {}
  lxs: Record<string, number> = {}
  mv: Record<string, number> = {}
  cap: Record<string, boolean> = {}
  ht: any = null
  ht2: any = null
  ht3: any = null
  scT: any = null
  pending: FavItem | null = null
  hold = false
  held = false
  held2 = false
  nm = ''
  ad = ''
  lastN?: number
  sfGo = false
  pos: Record<string, { x: number; y: number }> = {}
  pp: Array<{ l: number; w: number }> = []
  afterNew: (() => void) | null = null
  afterTs: (() => void) | null = null
  afterClose: (() => void) | null = null
  privNext = false

  constructor(props: {}) {
    super(props)
    let savedLib = DEFAULT_LIB
    let savedHist = ['lofi beats', 'timelapse 4k', 'movie trailers']
    let savedFavs = DEFAULT_FAVS
    let savedDh: DhRow[] = [
      { title: 'Big Buck Bunny (Open Source 4K)', fmt: '1080p · MP4', when: 'Today', status: 'Completed', ink: '#3ecf8e' },
      { title: 'Elephants Dream Sci-Fi', fmt: '720p · MP4', when: 'Today', status: 'Completed', ink: '#3ecf8e' },
    ]

    if (typeof localStorage !== 'undefined') {
      try {
        const rawLib = localStorage.getItem(STORAGE_KEY_LIB)
        if (rawLib) savedLib = JSON.parse(rawLib)
        const rawHist = localStorage.getItem(STORAGE_KEY_HIST)
        if (rawHist) savedHist = JSON.parse(rawHist)
        const rawFavs = localStorage.getItem(STORAGE_KEY_FAVS)
        if (rawFavs) savedFavs = JSON.parse(rawFavs)
        const rawDh = localStorage.getItem(STORAGE_KEY_DH)
        if (rawDh) savedDh = JSON.parse(rawDh)
      } catch {}
    }

    this.state = {
      sc: {},
      scv: 0,
      dh: false,
      dhc: false,
      dhRows: savedDh,
      lf: 0,
      ld: null,
      dr: [],
      lib: savedLib,
      dp: [],
      dx: null,
      dm: false,
      dmc: false,
      cell: [],
      lm: false,
      lay: 'list',
      lq: '',
      hmenu: null,
      sel: false,
      selIds: [],
      selConf: false,
      stOpen: false,
      info: null,
      swm: false,
      pm: false,
      pmp: 0,
      cpriv: false,
      pv: 0,
      tmc: false,
      caOn: false,
      cax: 0,
      tm: false,
      tmp: 0,
      dw: false,
      dwp: 0,
      hb: 1,
      ci: 0,
      tsp: 0,
      tsph: '',
      sf: 0,
      pa: 0,
      pb: 0,
      nph: '',
      npp: 0,
      cl: null,
      cf: 0,
      pt: 0,
      nz: null,
      nzph: '',
      nzp: 0,
      nzf: 0,
      hist: savedHist,
      hm: false,
      hmp: 0,
      hop: 0,
      screen: 'browse',
      sheet: false,
      fmt: 'v720',
      jobs: [],
      playing: '',
      playingMedia: null,
      seq: null,
      sp: 0,
      q: '',
      tabs: [],
      sw: false,
      swp: 0,
      swt: 0,
      adding: false,
      mp: 0,
      gp: 1,
      pick: 0,
      newId: '',
      fx: 0,
      rx: 0,
      scale: 1,
      favs: savedFavs,
      detectedVideo: null,
      webviewSrc: '',
      webviewUrl: '',
    }
  }

  handleResize = () => {
    if (typeof window !== 'undefined') {
      const sw = (window.innerWidth - 32) / 900
      const sh = (window.innerHeight - 32) / 1260
      this.setState({ scale: Math.min(sw, sh, 1) })
    }
  }

  handleMessage = (e: MessageEvent) => {
    const data = e.data
    if (data && data.source === 'vd-browser') {
      if (data.type === 'detect' && data.payload?.url) {
        const { url, title, thumbnail } = data.payload
        this.handleVideoDetected(url, title, thumbnail)
      } else if (data.type === 'select-video' && data.payload?.url) {
        const { url, title, thumbnail } = data.payload
        this.handleVideoDetected(url, title, thumbnail)
        this.setState({ sheet: true })
      } else if (data.type === 'search-query' && data.payload?.query) {
        this.executeSearch(data.payload.query)
      }
    }
  }

  executeSearch = (text: string) => {
    const query = (text || '').trim()
    if (!query) return

    const updatedTabs = this.state.tabs.length > 0
      ? this.state.tabs.map((tab, idx) => idx === this.state.ci ? { ...tab, text: query } : tab)
      : [{ id: 1, text: query }]

    const nextHist = [query, ...this.state.hist.filter((h) => h !== query)].slice(0, 8)
    const isAlreadyUp = this.state.seq?.phase === 'done' || (!!this.state.webviewSrc && !this.state.seq)
    const initialPhase = isAlreadyUp ? 'load' : 'fade'

    this.setState({
      screen: 'browse',
      seq: { key: 'search:' + query, text: query, phase: initialPhase, t0: Date.now() },
      sp: 0,
      q: query,
      tabs: updatedTabs,
      hist: nextHist,
    }, () => {
      this.saveStorage()
      this.handleVideoDetected(query)
    })
  }

  handleVideoDetected = async (url: string, title?: string, thumbnail?: string) => {
    try {
      const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`)
      if (res.ok) {
        const info = await res.json()
        const formats: FormatOption[] = (info.formats || []).map((f: any) => ({
          id: f.id,
          label: f.label,
          meta: f.kind === 'audio' ? 'Audio · M4A' : `${f.ext.toUpperCase()} · ${f.height || 720}p`,
        }))
        this.setState({
          detectedVideo: {
            url,
            title: info.title || title || 'Detected Video',
            thumbnail: info.thumbnail || thumbnail,
            durationSec: info.durationSec,
            formats: formats.length > 0 ? formats : [
              { id: 'v720', label: '720p HD MP4', meta: 'Video · H.264' },
              { id: 'v480', label: '480p MP4', meta: 'Video · smaller file' },
              { id: 'a', label: 'Audio only', meta: 'M4A · for the music loop' },
            ],
          },
          fmt: formats[0]?.id || 'v720',
        })
        return
      }
    } catch {}

    // Fallback if offline
    this.setState({
      detectedVideo: {
        url,
        title: title || 'Detected Video',
        thumbnail,
        formats: [
          { id: 'v1080', label: '1080p MP4', meta: 'Video · Full HD' },
          { id: 'v720', label: '720p MP4', meta: 'Video · H.264' },
          { id: 'v480', label: '480p MP4', meta: 'Video · smaller file' },
          { id: 'a', label: 'Audio only', meta: 'M4A · for the music loop' },
        ],
      },
      fmt: 'v720',
    })
  }

  saveStorage = () => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_LIB, JSON.stringify(this.state.lib))
        localStorage.setItem(STORAGE_KEY_HIST, JSON.stringify(this.state.hist))
        localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(this.state.favs))
        localStorage.setItem(STORAGE_KEY_DH, JSON.stringify(this.state.dhRows))
      } catch {}
    }
  }

  componentDidMount() {
    this.handleResize()
    window.addEventListener('resize', this.handleResize)
    window.addEventListener('message', this.handleMessage)

    // Download jobs progress ticker
    this.t = setInterval(() => {
      const js = this.state.jobs
      if (!js.some((j) => j.status === 'downloading')) return

      const updated = js.map((j) => {
        if (j.status !== 'downloading') return j
        const nextPct = Math.min(100, j.pct + 10)
        if (nextPct >= 100) {
          const finishedJob: JobItem = { ...j, pct: 100, status: 'done' }
          // Add to Library with real metadata
          const isFmt1080 = j.fmtLabel.includes('1080')
          const isFmt480 = j.fmtLabel.includes('480')
          const sizeStr = j.audio ? '9.4 MB' : isFmt1080 ? '185 MB' : isFmt480 ? '39 MB' : '84 MB'
          const mbNum = j.audio ? 9 : isFmt1080 ? 185 : isFmt480 ? 39 : 84
          const durSec = this.state.detectedVideo?.durationSec || 596
          const minutes = Math.floor(durSec / 60)
          const seconds = String(durSec % 60).padStart(2, '0')

          const newLibItem: LibItem = {
            id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: j.title,
            fmt: j.fmtLabel,
            size: sizeStr,
            when: 'Just now',
            dur: `${minutes}:${seconds}`,
            audio: !!j.audio,
            mb: mbNum,
            isNew: true,
            src: j.src || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          }
          const nextDh: DhRow = {
            title: j.title,
            fmt: j.fmtLabel,
            when: 'Just now',
            status: 'Completed',
            ink: '#3ecf8e',
          }
          setTimeout(() => {
            this.setState((prev) => ({
              lib: [newLibItem, ...prev.lib],
              dhRows: [nextDh, ...prev.dhRows],
            }), this.saveStorage)
          }, 200)
          return finishedJob
        }
        return { ...j, pct: nextPct }
      })
      this.setState({ jobs: updated })
    }, 500)

    this.rtick = setInterval(() => {
      const q = this.state.seq
      if (q && (q.phase === 'load' || q.phase === 'done')) this.setState({ rt: Date.now() })
    }, 16)

    this.tick = setInterval(() => {
      const s = this.state
      const up: Partial<AppState> = {}
      if (s.adding && s.mp < 1) up.mp = Math.min(1, s.mp + 0.14)
      if (s.sw && s.swp < 1) up.swp = Math.min(1, s.swp + 0.14)
      if (s.sw) up.swt = Math.min(6000, s.swt + 30)
      else if (s.swp === 0 && s.swt) up.swt = 0
      if (!s.sw && s.swp > 0) up.swp = Math.max(0, s.swp - 0.14)
      if (!s.adding && s.mp > 0) {
        up.mp = Math.max(0, s.mp - 0.12)
        if (up.mp === 0 && this.pending) {
          const fw = s.favs.length * 120
          const o = this.norm(s.fx, fw)
          const idx = Math.floor(((((234 - o) % fw) + fw) % fw) / 120) % s.favs.length
          const nextFavs = [...s.favs.slice(0, idx), this.pending, ...s.favs.slice(idx)]
          up.favs = nextFavs
          up.newId = this.pending.label
          up.gp = 0
          up.fx = o
          this.pending = null
          this.saveStorage()
        }
      }
      if (s.gp < 1) {
        up.gp = Math.min(1, s.gp + 0.05)
        if (up.gp === 1) {
          this.hold = false
          this.act.fx = 0
        }
      }
      if (s.seq) {
        if (s.seq.phase === 'fade') {
          const p = Math.min(1, s.sp + 0.045)
          up.sp = p
          if (p === 1) {
            up.seq = { ...s.seq, phase: 'scan' }
            up.sp = 0
          }
        } else if (s.seq.phase === 'scan') {
          const p = Math.min(1, s.sp + (s.seq.skip ? 0.08 : 0.045))
          up.sp = p
          if (p === 1) {
            up.seq = { ...s.seq, phase: s.seq.skip ? 'done' : 'load', t0: Date.now() }
            up.sp = 0
          }
        } else if (s.seq.phase === 'load') {
          const p = Math.min(1, s.sp + 0.04)
          up.sp = p
          if (p === 1) {
            up.seq = { ...s.seq, phase: 'done' }
            up.sp = 0
            if (!s.cpriv) {
              const nextHist = [s.seq.text, ...s.hist.filter((h) => h !== s.seq!.text)].slice(0, 8)
              up.hist = nextHist
              setTimeout(this.saveStorage, 100)
            }
            // Resolve Webview Source URL
            const txt = s.seq.text.trim()
            let webSrc = `/api/webview-search?q=${encodeURIComponent(txt)}`
            let webUrl = `search://${encodeURIComponent(txt)}`

            const ytMatch = txt.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
            if (ytMatch) {
              webSrc = `/api/webview-search?q=${encodeURIComponent(txt)}`
              webUrl = `https://www.youtube.com/watch?v=${ytMatch[1]}`
            } else if (/\.(mp4|mov|webm|m4v|m3u8)(\?|$)/i.test(txt)) {
              webSrc = `/api/webview-search?q=${encodeURIComponent(txt)}`
              webUrl = txt
            } else if (/^https?:\/\//i.test(txt)) {
              if (txt.includes('youtube.com') || txt.includes('youtu.be')) {
                webSrc = `/api/webview-search?q=${encodeURIComponent(txt)}`
                webUrl = txt
              } else {
                webSrc = txt
                webUrl = txt
              }
            } else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(txt)) {
              if (txt.includes('youtube.com') || txt.includes('youtu.be')) {
                webSrc = `/api/webview-search?q=trending`
                webUrl = `https://${txt}`
              } else {
                webSrc = `https://${txt}`
                webUrl = `https://${txt}`
              }
            }
            up.webviewSrc = webSrc
            up.webviewUrl = webUrl
            this.handleVideoDetected(txt)
          }
        } else if (s.seq.phase === 'done' && s.sp < 1) {
          up.sp = Math.min(1, s.sp + 0.07)
        } else if (s.seq.phase === 'rdown') {
          const p = Math.min(1, s.sp + 0.04)
          up.sp = p
          if (p === 1) {
            up.seq = { ...s.seq, phase: 'rup' }
            up.sp = 0
            up.q = ''
          }
        } else if (s.seq.phase === 'rup') {
          const p = Math.min(1, s.sp + 0.045)
          up.sp = p
          if (p === 1) {
            up.seq = { ...s.seq, phase: 'rfade' }
            up.sp = 0
          }
        } else if (s.seq.phase === 'rfade') {
          const p = Math.min(1, s.sp + 0.08)
          up.sp = p
          if (p === 1) {
            up.seq = null
            up.sp = 0
            up.q = ''
            up.detectedVideo = null
          }
        }
      }
      const idle = (k: string) => !this.dr[k] && Date.now() - (this.act[k] || 0) > 1800
      const favBusy = this.hold || s.adding || s.mp > 0 || s.gp < 1
      if (s.screen === 'browse') {
        if (idle('fx') && !favBusy && !s.seq) up.fx = s.fx - 0.9
        if (idle('rx') && !s.seq) up.rx = s.rx + 0.75
      }
      if (s.nph) {
        if (s.nph === 'slide') {
          const p = Math.min(1, s.npp + 0.085)
          up.npp = p
          if (p === 1) {
            up.nph = 'hold'
            up.npp = 0
          }
        } else if (s.nph === 'hold') {
          const p = Math.min(1, s.npp + 0.08)
          up.npp = p
          if (p === 1) {
            up.nph = 'out'
            up.npp = 0
            const f = this.afterNew
            this.afterNew = null
            if (f) f()
          }
        } else if (s.nph === 'out') {
          const p = Math.min(1, s.npp + 0.1)
          up.npp = p
          if (p === 1) {
            up.nph = ''
            up.npp = 0
          }
        }
      }
      {
        const ap = (v: number, t: number, u: number, d: number) =>
          t > v ? Math.min(t, v + u) : Math.max(t, v - d)
        const strip = s.tabs.length > 0 && s.screen === 'browse'
        const topT = strip && (!s.seq || s.seq.phase === 'rfade') ? 1 : 0
        const underT = strip && s.seq && s.seq.phase === 'done' ? 1 : 0
        const npa = ap(s.pa, topT, 0.07, 0.14)
        const npb = ap(s.pb, underT, 0.035, 0.12)
        if (npa !== s.pa) up.pa = npa
        if (npb !== s.pb) up.pb = npb
        const nL = s.tabs.length + 1 + (s.nph === 'slide' || s.nph === 'hold' ? 1 : 0)
        let mv = false
        for (let i = 0; i < nL; i++) {
          const gg = this.geo(nL, 112, 148, 8, 64)
          const tl = gg.base + i * gg.pitch
          const tw = gg.w
          const q = this.pp[i]
          if (!q) {
            this.pp[i] = { l: tl, w: tw }
            continue
          }
          if (Math.abs(tl - q.l) + Math.abs(tw - q.w) > 0.5) {
            q.l += (tl - q.l) * 0.2
            q.w += (tw - q.w) * 0.2
            mv = true
          } else {
            q.l = tl
            q.w = tw
          }
        }
        if (mv) up.pt = Date.now()
        if (this.lastN !== undefined && s.tabs.length > this.lastN) this.sfGo = true
        this.lastN = s.tabs.length
        if (this.sfGo && !this.dr.sf) {
          const nf = s.sf + (1 - s.sf) * 0.15
          if (1 - nf < 0.004) {
            up.sf = 1
            this.sfGo = false
          } else up.sf = nf
        }
      }
      if (s.tsph) {
        if (s.tsph === 'out') {
          const v = Math.min(1, s.tsp + 0.1)
          up.tsp = v
          if (v === 1) {
            up.tsph = 'in'
            const f = this.afterTs
            this.afterTs = null
            if (f) f()
          }
        } else {
          const v = Math.max(0, s.tsp - 0.08)
          up.tsp = v
          if (v === 0) up.tsph = ''
        }
      }
      if (s.caOn) {
        const v = Math.min(1, s.cax + 0.08)
        up.cax = v
        if (v >= 1) {
          up.caOn = false
          up.cax = 0
          up.tabs = []
          up.ci = 0
          up.cpriv = false
          this.pos = {}
          this.pp = []
        }
      }
      if (s.cl) {
        const p = Math.min(1, s.cf + 0.09)
        up.cf = p
        if (p >= 1) {
          const f = this.afterClose
          this.afterClose = null
          up.cl = null
          up.cf = 0
          if (f) f()
        }
      }
      {
        const vis = s.sw || s.swp > 0
        let moving = false
        this.ids(s).forEach((id, i) => {
          const [tx, ty] = this.xy(i)
          const q = this.pos[id]
          if (!q) {
            this.pos[id] = { x: tx, y: ty }
            return
          }
          const dx = tx - q.x
          const dy = ty - q.y
          if (vis && Math.abs(dx) + Math.abs(dy) > 0.5) {
            q.x += dx * 0.2
            q.y += dy * 0.2
            moving = true
          } else {
            q.x = tx
            q.y = ty
          }
        })
        if (moving) up.pt = Date.now()
      }
      if (s.nz) {
        if (s.nzph === 'zoom') {
          const p = Math.min(1, s.nzp + 0.045)
          up.nzp = p
          if (p === 1) {
            up.nzph = 'fade'
            up.sw = false
            Object.assign(up, s.nz.base)
          }
        } else if (s.nzph === 'fade') {
          const f = Math.min(1, s.nzf + 0.02)
          up.nzf = f
          if (f === 1) {
            up.nz = null
            up.nzph = ''
            up.nzp = 0
            up.nzf = 0
          }
        }
      }
      const hv = s.screen === 'browse' && !s.seq && !s.sw && !s.adding
      if (!hv && s.hm) up.hm = false
      if (s.tm && s.sw) up.tm = false
      if (!s.tm && s.tmc) up.tmc = false
      if (!s.sw && s.pm) up.pm = false
      if (s.pm && s.pmp < 1) up.pmp = Math.min(1, s.pmp + 0.14)
      else if (!s.pm && s.pmp > 0) up.pmp = Math.max(0, s.pmp - 0.14)
      if (s.tm && s.tmp < 1) up.tmp = Math.min(1, s.tmp + 0.14)
      else if (!s.tm && s.tmp > 0) up.tmp = Math.max(0, s.tmp - 0.14)
      if (s.hm && s.hmp < 1) up.hmp = Math.min(1, s.hmp + 0.14)
      else if (!s.hm && s.hmp > 0) up.hmp = Math.max(0, s.hmp - 0.14)
      {
        const hT = s.screen === 'browse' && (!s.seq || s.seq.phase === 'rfade') ? 1 : 0
        if (s.hb !== hT) up.hb = hT > s.hb ? Math.min(1, s.hb + 0.1) : Math.max(0, s.hb - 0.1)
        const pT = s.cpriv ? 1 : 0
        if (s.pv !== pT) up.pv = pT > s.pv ? Math.min(1, s.pv + 0.08) : Math.max(0, s.pv - 0.08)
        if (s.dw && s.dwp < 1) up.dwp = Math.min(1, s.dwp + 0.12)
        else if (!s.dw && s.dwp > 0) up.dwp = Math.max(0, s.dwp - 0.12)
      }
      if (Object.keys(up).length) this.setState(up as any)
    }, 30)
  }

  componentWillUnmount() {
    clearInterval(this.t)
    clearInterval(this.tick)
    clearInterval(this.rtick)
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('message', this.handleMessage)
  }

  geo(n: number, mn: number, mx: number, gap: number, pmin: number) {
    let w: number, pitch: number
    if (n * mn + gap * (n - 1) <= 492) {
      w = Math.min(mx, Math.floor((492 - gap * (n - 1)) / n))
      pitch = w + gap
    } else {
      w = mn
      pitch = Math.max(pmin, Math.floor((492 - mn) / (n - 1)))
    }
    const content = (n - 1) * pitch + w
    const over = content > 492
    return { w, pitch, content, over, range: over ? content - 492 : 0, base: over ? 164 : (820 - content) / 2 }
  }

  ids(s: AppState): string[] {
    const l = s.tabs.filter((t) => !!t.priv === s.swm)
    return [
      ...(s.swm === s.cpriv ? ['cur'] : []),
      ...l.map((t) => String(t.id)),
      ...(s.tabs.length + 1 < 10 ? ['new'] : []),
    ]
  }

  xy(i: number): [number, number] {
    return [(i % 2) * 376, Math.floor(i / 2) * 552]
  }

  norm(v: number, w: number): number {
    return Math.round((((v % w) + w) % w) - w)
  }

  startDownload = () => {
    const s = this.state
    const video = s.detectedVideo
    const f = video?.formats.find((x) => x.id === s.fmt) || video?.formats[0] || {
      id: 'v720',
      label: '720p HD MP4',
      meta: 'Video · H.264',
    }

    const title = video?.title || 'Downloaded Video'
    const isAudio = f.id.startsWith('a')
    const newJob: JobItem = {
      id: Date.now(),
      title,
      fmtLabel: f.label,
      pct: 0,
      status: 'downloading',
      src: video?.url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      audio: isAudio,
    }

    this.setState({
      sheet: false,
      jobs: [newJob, ...s.jobs],
    })
  }

  render() {
    const s = this.state
    const active = s.jobs.filter((j) => j.status === 'downloading')
    const first = active[0]

    const thumb = (k: string) => {
      const m = s.sc[k]
      if (!m || m.h <= m.c + 1) return { display: 'none' }
      const th = Math.max(44, Math.round((m.c * m.c) / m.h))
      const top = 4 + Math.round((m.t / (m.h - m.c)) * (m.c - th - 8))
      return {
        position: 'absolute' as const,
        right: 4,
        top,
        width: 5,
        height: th,
        borderRadius: 3,
        background: 'rgba(232,234,240,.6)',
        pointerEvents: 'none' as const,
        transition: 'opacity .3s',
        opacity: Date.now() - m.at < 900 ? 1 : 0,
      }
    }

    const onSc = (k: string) => (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      this.setState({
        sc: {
          ...this.state.sc,
          [k]: { t: el.scrollTop, h: el.scrollHeight, c: el.clientHeight, at: Date.now() },
        },
      })
      clearTimeout(this.scT)
      this.scT = setTimeout(() => this.setState({ scv: Date.now() }), 1000)
    }

    const fillOf = (pct: number, c: string, extra?: string) =>
      `display:block;height:6px;border-radius:3px;background:${c};width:${pct}%${extra || ''}`
    const ringOf = (pct: number, c: string) =>
      `flex:none;padding:3px;border-radius:16px;background:conic-gradient(${c} ${pct}%,#2b3140 0)`

    const dlMk = (o: any) => ({
      audio: false,
      isErr: false,
      showBar: true,
      err: '',
      meta: '',
      subInk: '#9aa3b2',
      pct: 0,
      color: '#3ecf8e',
      waiting: false,
      remux: false,
      detail: '',
      ...o,
    })

    const dlRows = s.jobs
      .filter((j) => !s.dr.includes(j.title))
      .map((j, i) => {
        const isPaused = s.dp.includes(j.title) || j.status === 'paused'
        const isFailed = j.status === 'failed'
        const color = isFailed ? '#ff7a9c' : isPaused ? '#6b7385' : '#3ecf8e'
        const subInk = isFailed ? '#ff7a9c' : isPaused ? '#9aa3b2' : '#3ecf8e'
        const sub = isFailed
          ? 'Failed · ' + j.fmtLabel
          : isPaused
            ? 'Paused · ' + j.fmtLabel
            : 'Downloading · ' + j.fmtLabel
        const meta = isPaused
          ? 'Paused · tap resume to continue'
          : `${j.pct}% · ${j.audio ? '2.4 MB/s' : '5.8 MB/s'}`

        return dlMk({
          title: j.title,
          sub,
          subInk,
          meta,
          pct: j.pct,
          color,
          audio: !!j.audio,
          isErr: isFailed,
          paused: isPaused,
          notPaused: !isPaused,
          canPause: !isFailed,
          pauseLbl: isPaused ? 'Resume' : 'Pause',
          bar: fillOf(j.pct, color),
          ringBg: ringOf(isFailed ? 100 : j.pct, color),
          isMedia: !j.audio,
          anim: `animation:vdpop .42s cubic-bezier(.2,.8,.2,1) both;animation-delay:${i * 40}ms`,
          togglePause: () => {
            this.setState((prev) => ({
              dp: isPaused ? prev.dp.filter((x) => x !== j.title) : [...prev.dp, j.title],
              jobs: prev.jobs.map((job) =>
                job.id === j.id ? { ...job, status: isPaused ? 'downloading' : 'paused' } : job,
              ),
            }))
          },
          toggleEx: () => this.setState((prev) => ({ dx: prev.dx === j.title ? null : j.title })),
          remove: () => {
            this.setState((prev) => ({
              jobs: prev.jobs.filter((x) => x.id !== j.id),
              dr: [...prev.dr, j.title],
            }))
          },
        })
      })

    const dlActive = s.jobs.filter((r) => r.status === 'downloading').length
    const dlFailed = s.jobs.some((r) => r.status === 'failed')

    const cards = s.lay === 'cards'
    const libAll: LibItem[] = s.lib
    const mbTotal = libAll.reduce((a, r) => a + r.mb, 0)
    const qs = (s.lq || '').trim().toLowerCase()
    const libFiltered = libAll.filter(
      (r) =>
        (s.lf === 0 || (s.lf === 1 ? !r.audio : r.audio)) &&
        (!qs || r.title.toLowerCase().includes(qs)),
    )

    const pickToggle = (id: string) =>
      this.setState({
        selIds: s.selIds.includes(id) ? s.selIds.filter((x) => x !== id) : [...s.selIds, id],
      })

    const libRows = libFiltered.map((r, i) => {
      const picked = s.selIds.includes(r.id)
      return {
        ...r,
        sub: r.missing ? 'File missing' : r.fmt + ' · ' + r.size + ' · ' + r.when,
        subInk: r.missing ? '#ff7a9c' : '#9aa3b2',
        notAudio: !r.audio,
        hasDur: !!r.dur && !r.missing,
        showNew: !!r.isNew && !r.missing,
        showProg: !!r.prog,
        progSt: 'height:3px;border-radius:2px;background:#7c5cff;width:' + (r.prog || 0) + '%',
        showPriv: !!r.priv,
        rowSt:
          'position:relative;z-index:' +
          (s.hmenu === r.id ? 9 : 0) +
          ';opacity:' +
          (r.missing ? 0.55 : 1) +
          ';animation:vdpop .42s cubic-bezier(.2,.8,.2,1) both;animation-delay:' +
          Math.min(i, 12) * 40 +
          'ms',
        isCard: cards,
        isList: !cards,
        showSub: !!r.missing,
        cardSt:
          (cards
            ? 'position:relative;height:210px;border-radius:22px;overflow:hidden;background:linear-gradient(135deg,#3a3560,#171826)'
            : 'position:relative;display:flex;gap:14px;align-items:center;padding:10px 10px 10px 10px;border-radius:20px;background:#14161d') +
          ';box-shadow:' +
          (picked
            ? 'inset 0 0 0 2px #7c5cff'
            : cards
              ? '0 10px 28px rgba(0,0,0,.35)'
              : 'inset 0 0 0 1px rgba(255,255,255,.04)') +
          ';transition:box-shadow .25s ease',
        mOpen: () => this.setState({ hmenu: r.id }),
        showPlay: !s.sel && !r.missing,
        showActs: !s.sel,
        selOn: s.sel,
        picked,
        notPicked: !picked,
        conf: s.ld === r.id,
        menuOn: s.hmenu === r.id,
        down: () => {
          this.hold = false
          clearTimeout(this.ht3)
          this.ht3 = setTimeout(() => {
            this.hold = true
            this.setState({ hmenu: r.id })
          }, 520)
        },
        up: () => clearTimeout(this.ht3),
        tap: () => {
          if (this.hold) {
            this.hold = false
            return
          }
          if (s.sel) {
            pickToggle(r.id)
            return
          }
          if (!r.missing) {
            this.setState({
              playing: r.title + ' · ' + r.fmt,
              playingMedia: { url: r.src, title: r.title, audio: r.audio },
            })
          }
        },
        play: () => {
          this.setState({
            playing: r.title + ' · ' + r.fmt,
            playingMedia: { url: r.src, title: r.title, audio: r.audio },
          })
        },
        share: () => {
          if (typeof navigator !== 'undefined' && navigator.share) {
            navigator.share({ title: r.title, url: r.src }).catch(() => {})
          }
        },
        ask: () => this.setState({ ld: r.id }),
        no: () => this.setState({ ld: null }),
        yes: () => {
          const nextLib = s.lib.filter((x) => x.id !== r.id)
          this.setState({ lib: nextLib, ld: null }, this.saveStorage)
        },
        mInfo: () => this.setState({ info: r.id, hmenu: null }),
        mSel: () => this.setState({ sel: true, selIds: [r.id], hmenu: null }),
        mDel: () => this.setState({ ld: r.id, hmenu: null }),
        mPlay: () => {
          this.setState({
            playing: r.title + ' · ' + r.fmt,
            playingMedia: { url: r.src, title: r.title, audio: r.audio },
            hmenu: null,
          })
        },
        mShare: () => this.setState({ hmenu: null }),
      }
    })

    const infoItem = libAll.find((r) => r.id === s.info) || null
    const vMb = libAll.filter((r) => !r.audio).reduce((a, r) => a + r.mb, 0)
    const aMb = libAll.filter((r) => r.audio).reduce((a, r) => a + r.mb, 0)
    const fMb = 42 * 1024
    const tMb = vMb + aMb + fMb
    const fmtMb = (m: number) => (m >= 1024 ? (m / 1024).toFixed(1) + ' GB' : m + ' MB')
    const largest = [...libAll]
      .sort((a, b) => b.mb - a.mb)
      .slice(0, 5)
      .map((r) => ({ title: r.title, size: r.size }))
    const selCount = s.selIds.length

    const chip = (on: boolean) => ({
      minHeight: 44,
      padding: '0 20px',
      borderRadius: 22,
      fontSize: 16,
      fontWeight: 600,
      transition: 'background .25s ease,color .25s ease',
      background: on ? '#2d2a55' : 'rgba(255,255,255,.05)',
      color: on ? '#d7ccff' : '#9aa3b2',
    })

    const navStyle = (on: boolean) => ({
      position: 'relative' as const,
      width: 56,
      height: 56,
      borderRadius: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: on ? '#d7ccff' : '#9aa3b2',
      background: on ? '#3a2f78' : 'none',
      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
      transition: 'background .25s ease,color .25s ease',
    })

    const fmts: FormatOption[] = s.detectedVideo?.formats?.length
      ? s.detectedVideo.formats
      : [
          { id: 'v1080', label: '1080p MP4', meta: 'Video · Full HD' },
          { id: 'v720', label: '720p MP4', meta: 'Video · H.264' },
          { id: 'v480', label: '480p MP4', meta: 'Video · smaller file' },
          { id: 'a', label: 'Audio only', meta: 'M4A · for the music loop' },
        ]

    const rawRecents = s.hist.length ? s.hist : ['lofi study mix', 'timelapse 4k', 'movie trailers']
    const clip = (t: string) => {
      const w = t.trim().split(/\s+/)
      let o = w.slice(0, 2).join(' ')
      if (o.length > 14) o = o.slice(0, 14).trim()
      return o !== t.trim() ? o + '…' : o
    }

    const fw = s.favs.length * 120
    const rw = rawRecents.length * 120
    const norm = (v: number, w: number) => Math.round((((v % w) + w) % w) - w)

    const mk = (key: 'fx' | 'rx') => ({
      onPointerDown: (e: React.PointerEvent) => {
        this.dr[key] = true
        this.mv[key] = 0
        this.lxs[key] = e.clientX
        this.act[key] = Date.now()
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!this.dr[key]) return
        const dx = e.clientX - this.lxs[key]
        this.lxs[key] = e.clientX
        this.act[key] = Date.now()
        this.mv[key] = (this.mv[key] || 0) + Math.abs(dx)
        if (this.mv[key] > 6 && !this.cap[key]) {
          this.cap[key] = true
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } catch {}
        }
        this.setState({ [key]: this.state[key] + dx } as any)
      },
      onPointerUp: () => {
        if (this.dr[key]) {
          this.dr[key] = false
          this.act[key] = Date.now()
          if (this.cap) this.cap[key] = false
        }
      },
      onWheel: (e: React.WheelEvent) => {
        this.act[key] = Date.now()
        this.setState({ [key]: this.state[key] - (e.deltaX || 0) } as any)
      },
    })

    const fm = mk('fx')
    const rm = mk('rx')

    const PALETTE = [
      { name: 'Purple', bg: '#2d2a55', ink: '#b7a6ff' },
      { name: 'Green', bg: '#17382c', ink: '#3ecf8e' },
      { name: 'Amber', bg: '#3d2f12', ink: '#f2b84b' },
      { name: 'Rose', bg: '#3d1a26', ink: '#ff7a9c' },
    ]

    const ez = (x: number) => 1 - Math.pow(1 - x, 3)
    const sq = s.seq
    const ph = sq ? sq.phase : ''
    const mine = (key: string) =>
      sq && sq.key === key ? (ph === 'fade' ? 1 - s.sp : ph === 'rfade' ? s.sp : 0) : 1
    const start = (key: string, text: string, row: string) => () => {
      if (s.seq || (this.mv[row] || 0) > 6) return
      this.setState({ seq: { key, text, phase: 'fade' }, sp: 0, q: text })
    }
    const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
    const dist = ph === 'scan' ? 512 * eio(s.sp) : ph === 'load' || ph === 'done' ? 512 : 0
    const barOff =
      ph === 'scan'
        ? -dist
        : ph === 'load' || ph === 'done'
          ? -512
          : ph === 'rdown'
            ? -512 + 1032 * eio(s.sp)
            : ph === 'rup'
              ? 520 - 520 * eio(s.sp)
              : 0
    const clipBv =
      ph === 'scan'
        ? Math.max(0, Math.round(dist - 22))
        : ph === 'load' || ph === 'done' || ph === 'rdown' || ph === 'rup'
          ? 9999
          : 0

    const favView = s.favs.map((f) => {
      const g = f.label === s.newId && s.gp < 1 ? ez(s.gp) : 1
      return {
        ...f,
        w: Math.round(120 * g),
        o: g * mine('fav:' + f.label),
        open: start('fav:' + f.label, f.url || f.label, 'fx'),
      }
    })

    const P = 1074.5
    const tt = sq && sq.t0 ? (Date.now() - sq.t0) / 1000 : 0
    const head = (tt * 0.8 * P) % P
    const kk = 1 + 0.5 * Math.sin(tt * 5.2)
    const rr = [60, 130, 220, 340, 480].map((l, i) => {
      const len = Math.min(P - 10, l * kk)
      return {
        da: len.toFixed(1) + ' ' + (P - len).toFixed(1),
        off: ((((len - head) % P) + P) % P).toFixed(1),
        op: [1, 0.8, 0.55, 0.35, 0.2][i],
      }
    })
    const barW = Math.round(560 - 68 * Math.min(1, Math.max(0, -barOff / 512)))
    const laser =
      ph === 'fade'
        ? s.sp
        : ph === 'scan' || ph === 'load' || ph === 'rdown' || ph === 'rup'
          ? 1
          : ph === 'done' || ph === 'rfade'
            ? 1 - s.sp
            : 0
    const runner = ph === 'load' || ph === 'done'
    const runOp = (ph === 'load' ? 1 : ph === 'done' ? 1 - s.sp : 0) * (sq && sq.skip ? 0 : 1)
    const loading = ph === 'load'
    const status = sq ? 'Looking up ' + sq.text.slice(0, 40) + '…' : ''
    const qText = sq && ph === 'fade' ? sq.text.slice(0, Math.ceil(s.sp * sq.text.length)) : s.q
    const qAlpha = (ph === 'fade' ? 0.3 + 0.7 * s.sp : 1) * (1 - s.tsp)
    const showResults = (ph === 'done' || ph === 'rdown' || (!!s.webviewSrc && !s.seq)) && s.screen === 'browse'
    const resOp = ph === 'rdown' ? 1 - s.sp : ph === 'done' ? s.sp : 1
    const resY = ph === 'done' ? Math.round((1 - s.sp) * 16) : 0
    const resTitle = sq ? sq.text : s.q || 'Web Search'

    const pageUp = !!sq && (ph === 'load' || ph === 'done')
    const curText = pageUp ? sq.text : ''
    const restore = (text: string): Partial<AppState> =>
      text
        ? { seq: { key: 'restore', text, phase: 'done', t0: Date.now() }, sp: 1, q: text }
        : { seq: null, sp: 0, q: '' }
    const subOf = (t: string) => (t ? (/^\S+\.\S+$/.test(t) ? 'Website' : 'Search') : 'Home')

    const cI = Math.min(s.ci, s.tabs.length)
    const swapState = (t: TabItem): Partial<AppState> => {
      const full = [
        ...s.tabs.slice(0, cI),
        { id: t.id, text: curText, priv: s.cpriv },
        ...s.tabs.slice(cI),
      ]
      const k = s.tabs.findIndex((x) => x.id === t.id)
      const jj = k < cI ? k : k + 1
      return {
        tabs: full.filter((_, idx) => idx !== jj),
        ci: jj,
        cpriv: !!t.priv,
      }
    }

    const switchTab = (t: TabItem) => {
      if (s.tsph || s.nph || s.nz || s.cl || s.sw) return
      if (sq && !(ph === 'load' || ph === 'done')) return
      const patch = swapState(t)
      if (!pageUp) {
        if (t.text)
          this.setState({
            ...patch,
            seq: { key: 'tab:' + t.id, text: t.text, phase: 'fade', skip: true },
            sp: 0,
            q: t.text,
          } as any)
        else this.setState(patch as any)
        return
      }
      if (t.text) {
        this.afterTs = () => this.setState({ ...patch, ...restore(t.text) } as any)
        this.setState({ tsph: 'out', tsp: 0 })
      } else {
        this.setState({ ...patch, seq: { ...s.seq!, phase: 'rdown' }, sp: 0 } as any)
      }
    }

    const busy = s.caOn || s.cl || s.tsph || s.nph || s.nz
    const closeCurrent = () => {
      if (busy) return
      if (!s.tabs.length) {
        if (pageUp && s.screen === 'browse')
          this.setState({ seq: { ...s.seq!, phase: 'rdown' }, sp: 0 })
        return
      }
      const kk = cI > 0 ? cI - 1 : 0
      const n = s.tabs[kk]
      const patch = { tabs: s.tabs.filter((_, i) => i !== kk), ci: kk, cpriv: !!n.priv }
      this.afterClose = () => {
        if (this.pos.cur && this.pos[n.id]) {
          this.pos.cur = { ...this.pos[n.id] }
        }
        delete this.pos[n.id]
        if (!pageUp) {
          if (n.text)
            this.setState({
              ...patch,
              seq: { key: 'tab:' + n.id, text: n.text, phase: 'fade', skip: true },
              sp: 0,
              q: n.text,
            } as any)
          else this.setState(patch as any)
        } else if (n.text) {
          this.afterTs = () => this.setState({ ...patch, ...restore(n.text) } as any)
          this.setState({ tsph: 'out', tsp: 0 })
        } else {
          this.setState({ ...patch, seq: { ...s.seq!, phase: 'rdown' }, sp: 0 } as any)
        }
      }
      this.setState({ cl: { id: 'cur' }, cf: 0 })
    }

    const closeAll = () => {
      if (busy || (!s.tabs.length && !pageUp)) return
      if (pageUp && s.screen === 'browse')
        this.setState({ caOn: true, cax: 0, seq: { ...s.seq!, phase: 'rdown' }, sp: 0 })
      else this.setState({ caOn: true, cax: 0 })
    }

    const closeSw = () => this.setState({ sw: false })
    const pop = (i: number) => {
      const c = Math.max(0, Math.min(1, (s.swt - 140 - i * 110) / 260))
      const e = 1 - Math.pow(1 - c, 3)
      return {
        opacity: e,
        transform: `translateY(${Math.round((1 - e) * 16)}px) scale(${(0.82 + 0.18 * e).toFixed(3)})`,
      }
    }

    const addFromSw = (e: React.MouseEvent) => {
      if (s.nz) return
      let r = { x: 240, y: 460, w: 340, h: 453 }
      const el = e && (e.currentTarget as HTMLElement)
      const root = el && (el.closest('[data-swroot]') as HTMLElement)
      if (el && root) {
        const a = el.getBoundingClientRect()
        const b = root.getBoundingClientRect()
        const k = root.offsetWidth / b.width
        r = {
          x: (a.left - b.left) * k,
          y: (a.top - b.top) * k,
          w: a.width * k,
          h: a.height * k,
        }
      }
      const nt = [
        ...s.tabs.slice(0, cI),
        { id: Date.now(), text: pageUp ? sq!.text : '', priv: s.cpriv },
        ...s.tabs.slice(cI),
      ]
      const base = {
        tabs: nt,
        ci: nt.length,
        cpriv: s.swm,
        seq: null,
        sp: 0,
        q: '',
        screen: 'browse',
      }
      this.setState({ nz: { ...r, base }, nzph: 'zoom', nzp: 0, nzf: 0 })
    }

    const nzz = s.nz ? (s.nzph === 'zoom' ? eio(s.nzp) : 1) : 0
    const nzStyle: React.CSSProperties = !s.nz
      ? { display: 'none' }
      : {
          position: 'absolute',
          left: Number((s.nz.x * (1 - nzz)).toFixed(1)),
          top: Number((s.nz.y * (1 - nzz)).toFixed(1)),
          width: Number((s.nz.w + (820 - s.nz.w) * nzz).toFixed(1)),
          height: Number((s.nz.h + (1180 - s.nz.h) * nzz).toFixed(1)),
          boxSizing: 'border-box',
          borderRadius: Math.round(20 * (1 - nzz)),
          background: '#0e0f14',
          border: `2px dashed rgba(74,80,104,${(1 - nzz).toFixed(2)})`,
          opacity: Number((s.nzph === 'fade' ? 1 - s.nzf : 1).toFixed(3)),
          pointerEvents: s.nzph === 'zoom' ? 'auto' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#b7a6ff',
          fontSize: 96,
          fontWeight: 300,
        }

    const goTab = (t: TabItem) => () =>
      this.setState({
        ...swapState(t),
        ...restore(t.text),
        sw: false,
        screen: 'browse',
      } as any)

    const dropTab = (t: TabItem) => () => {
      if (s.cl) return
      this.afterClose = () => {
        delete this.pos[String(t.id)]
        const k = s.tabs.findIndex((x) => x.id === t.id)
        this.setState({
          tabs: s.tabs.filter((x) => x.id !== t.id),
          ci: k < cI ? cI - 1 : cI,
        })
      }
      this.setState({ cl: { id: String(t.id) }, cf: 0 })
    }

    const dropCur = () => {
      if (!s.tabs.length || s.cl) return
      const kk = cI > 0 ? cI - 1 : 0
      const n = s.tabs[kk]
      const rest = s.tabs.filter((_, idx) => idx !== kk)
      this.afterClose = () => {
        this.pos.cur = { ...(this.pos[String(n.id)] || this.pos.cur) }
        delete this.pos[String(n.id)]
        this.setState({ tabs: rest, ci: kk, cpriv: !!n.priv, ...restore(n.text) } as any)
      }
      this.setState({ cl: { id: 'cur' }, cf: 0 })
    }

    const swm = s.swm
    const vis = s.tabs.filter((t) => !!t.priv === swm)
    const showCur = swm === s.cpriv
    const off = showCur ? 1 : 0
    const swCount = vis.length + off

    const curCard = {
      id: 'cur',
      title: curText || (s.cpriv ? 'Private Browsing' : 'Start page'),
      sub: subOf(curText) + ' · current',
      pop: pop(0),
      ring: 'inset 0 0 0 3px #7c5cff',
      open: closeSw,
      close: dropCur,
      canClose: s.tabs.length > 0,
      dsp: 'block',
      isNew: false,
    }

    const tabCards = [
      ...(showCur ? [curCard] : []),
      ...vis.map((t, i) => ({
        id: String(t.id),
        title: t.text || (t.priv ? 'Private Browsing' : 'Start page'),
        sub: subOf(t.text),
        pop: pop(i + off),
        ring: 'none',
        open: goTab(t),
        close: dropTab(t),
        canClose: true,
        dsp: 'block',
        isNew: false,
      })),
      ...(s.tabs.length + 1 < 10
        ? [
            {
              id: 'new',
              title: '',
              sub: '',
              pop: pop(vis.length + off),
              ring: 'none',
              open: addFromSw,
              close: closeSw,
              canClose: false,
              dsp: 'none',
              isNew: true,
            },
          ]
        : []),
    ]

    const newTab = () => {
      const pr = !!this.privNext
      this.privNext = false
      if (this.held) {
        this.held = false
        return
      }
      if (s.nph || s.tabs.length + 1 >= 10) return
      this.afterNew = () => doNewTab(pr)
      this.sfGo = true
      if (pageUp && s.screen === 'browse') {
        this.setState({ nph: 'slide', npp: 0, seq: { ...s.seq!, phase: 'rdown' }, sp: 0 })
      } else {
        this.setState({ nph: 'slide', npp: 0 })
      }
    }

    const doNewTab = (pr: boolean) => {
      const nt = [
        ...s.tabs.slice(0, cI),
        { id: Date.now(), text: pageUp ? sq!.text : '', priv: s.cpriv },
        ...s.tabs.slice(cI),
      ]
      if (pageUp && s.screen === 'browse') {
        this.setState({ tabs: nt, ci: nt.length, cpriv: !!pr })
      } else {
        this.setState({ tabs: nt, ci: nt.length, cpriv: !!pr, seq: null, sp: 0, q: '', screen: 'browse' })
      }
    }

    const tabView = tabCards.map((c, i) => {
      const [tx, ty] = this.xy(i)
      const q = this.pos[c.id] || { x: tx, y: ty }
      const isMine = !!s.cl && s.cl.id === c.id
      const fo = isMine ? 1 - s.cf : 1
      const sc = isMine ? 1 - 0.08 * s.cf : 1
      return {
        ...c,
        slotStyle: {
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: 360,
          opacity: Number(fo.toFixed(3)),
          transform: `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) scale(${sc.toFixed(3)})`,
          pointerEvents: isMine ? ('none' as const) : ('auto' as const),
        },
      }
    })

    const gridH = Math.round(
      Math.max(
        0,
        ...tabCards.map((c, i) => (this.pos[c.id] ? this.pos[c.id].y : this.xy(i)[1]) + 528),
      ),
    )

    const nT = s.tabs.length + 1
    const pend = s.nph === 'slide' || s.nph === 'hold'
    const nL = nT + (pend ? 1 : 0)
    const nEnd = nL
    const lbl = (t: string, pv?: boolean) => t || (pv ? 'Private' : 'New tab')
    const titles = [
      ...s.tabs.slice(0, cI).map((t) => lbl(t.text, t.priv)),
      lbl(curText, s.cpriv),
      ...s.tabs.slice(cI).map((t) => lbl(t.text, t.priv)),
    ]
    const privs = [
      ...s.tabs.slice(0, cI).map((t) => !!t.priv),
      !!s.cpriv,
      ...s.tabs.slice(cI).map((t) => !!t.priv),
    ]

    const goPill = (i: number) =>
      i === cI
        ? () => {}
        : () => {
            if ((this.mv.sf || 0) > 6) return
            switchTab(s.tabs[i < cI ? i : i - 1])
          }

    const curMix = s.nph === 'slide' ? 1 - Math.min(1, s.npp / 0.35) : s.nph === 'hold' ? 0 : 1
    const mixc = (a: number[], b: number[], m: number) =>
      a.map((v, idx) => Math.round(b[idx] + (v - b[idx]) * m)).join(',')
    const pillCol = (cur: boolean) => {
      const m = cur ? curMix : 0
      return {
        background: `rgb(${mixc([124, 92, 255], [35, 39, 54], m)})`,
        color: `rgb(${mixc([255, 255, 255], [201, 206, 219], m)})`,
      }
    }

    const gT = this.geo(nL, 112, 148, 8, 64)
    const gU = this.geo(nT, 88, 120, 6, 52)
    const sxT = gT.over ? -s.sf * gT.range : 0
    const sxU = gU.over ? -s.sf * gU.range : 0

    const pillsTop = s.tabs.length
      ? titles.map((title, i) => {
          const cur = i === cI
          const q = this.pp[i] || { l: gT.base + i * gT.pitch, w: gT.w }
          const o =
            (cur && s.nph === 'out' ? 1 : s.pa) *
            (1 - s.swp) *
            (1 - s.cax) *
            (cur && s.cl && s.cl.id === 'cur' ? 1 - s.cf : 1)
          const cols = pillCol(cur)
          return {
            title,
            style: {
              position: 'absolute' as const,
              left: Number((q.l + sxT - 140).toFixed(1)),
              top: 20,
              width: Number(q.w.toFixed(1)),
              height: 44,
              boxSizing: 'border-box' as const,
              borderRadius: 22,
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 600,
              background: cols.background,
              color: cols.color,
              boxShadow:
                '0 8px 24px rgba(0,0,0,.4),-6px 0 14px rgba(0,0,0,.3)' +
                (privs[i] ? ',inset 0 0 0 1.5px #b7a6ff' : ''),
              pointerEvents: o > 0.5 ? ('auto' as const) : ('none' as const),
              opacity: Number(o.toFixed(3)),
            },
            go: goPill(i),
          }
        })
      : []

    const dly = nT > 1 ? 0.5 / (nT - 1) : 0
    const pillsUnder = s.tabs.length
      ? titles.map((title, i) => {
          const cur = i === cI
          const o =
            Math.max(0, Math.min(1, (s.pb - i * dly) / 0.5)) *
            (1 - s.swp) *
            (1 - s.cax) *
            (cur && s.cl && s.cl.id === 'cur' ? 1 - s.cf : 1)
          const cols = pillCol(cur)
          return {
            title,
            style: {
              position: 'absolute' as const,
              left: Number((gU.base + i * gU.pitch + sxU - 140).toFixed(1)),
              top: 2,
              width: gU.w,
              height: 34,
              boxSizing: 'border-box' as const,
              borderRadius: 17,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 600,
              background: cols.background,
              color: cols.color,
              boxShadow:
                [
                  gU.pitch < gU.w + 6 ? '-6px 0 12px rgba(0,0,0,.35)' : '',
                  privs[i] ? 'inset 0 0 0 1.5px #b7a6ff' : '',
                ]
                  .filter(Boolean)
                  .join(',') || 'none',
              pointerEvents: o > 0.5 ? ('auto' as const) : ('none' as const),
              opacity: Number(o.toFixed(3)),
            },
            go: goPill(i),
          }
        })
      : []

    const edge = 'linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent)'
    const rgMax = Math.max(gT.range, gU.range) || 1

    const sDown = (e: React.PointerEvent) => {
      this.dr.sf = true
      this.mv.sf = 0
      this.lxs.sf = e.clientX
      this.sfGo = false
    }
    const sMove = (e: React.PointerEvent) => {
      if (!this.dr.sf) return
      const dx = e.clientX - this.lxs.sf
      this.lxs.sf = e.clientX
      this.mv.sf = (this.mv.sf || 0) + Math.abs(dx)
      if (this.mv.sf > 6 && !this.cap.sf) {
        this.cap.sf = true
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {}
      }
      this.setState({ sf: Math.max(0, Math.min(1, this.state.sf - dx / rgMax)) })
    }
    const sUp = () => {
      if (this.dr.sf) {
        this.dr.sf = false
        if (this.cap) this.cap['sf'] = false
      }
    }
    const sWheel = (e: React.WheelEvent) => {
      this.sfGo = false
      this.setState({
        sf: Math.max(0, Math.min(1, this.state.sf + (e.deltaX || e.deltaY || 0) / rgMax)),
      })
    }
    const npz = s.nph === 'slide' ? eio(s.npp) : s.nph ? 1 : 0
    const gE = this.geo(nEnd, 112, 148, 8, 64)
    const endL = gE.base + (nEnd - 1) * gE.pitch - (gE.over ? gE.range : 0)
    const endW = gE.w
    const plusFrac = Math.max(0, Math.min(1, (npz - 0.3) / 0.6))

    const npStyle: React.CSSProperties = {
      position: 'absolute',
      left: Number((674 + (endL - 674) * npz).toFixed(1)),
      top: Number((48 + 8 * npz).toFixed(1)),
      width: Number((60 + (endW - 60) * npz).toFixed(1)),
      height: Number((60 - 16 * npz).toFixed(1)),
      boxSizing: 'border-box',
      borderRadius: Number((30 - 8 * npz).toFixed(1)),
      background: `rgba(124,92,255,${npz.toFixed(3)})`,
      color: npz > 0.3 ? '#fff' : '#e8eaf0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      pointerEvents: 'none',
      boxShadow: `0 8px 24px rgba(0,0,0,${(0.4 * npz).toFixed(2)})`,
    }

    const npLabel: React.CSSProperties = {
      fontSize: 15,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      width: Math.round(Math.max(0, endW - 28) * Math.min(1, npz * 1.2)),
      textAlign: 'center',
      marginLeft: Math.round(8 * (1 - plusFrac)),
      opacity: Number(Math.max(0, Math.min(1, (npz - 0.5) * 2)).toFixed(2)),
    }
    const npIc = Math.round(34 * (1 - plusFrac))

    const isHomeNow = s.screen === 'browse' && (!s.seq || s.seq.phase === 'rfade')
    const hbStyle: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      opacity: Number(s.hb.toFixed(2)),
      transform: `scale(${(0.7 + 0.3 * s.hb).toFixed(3)})`,
    }
    const hhStyle: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      opacity: Number((1 - s.hb).toFixed(2)),
      transform: `scale(${(0.7 + 0.3 * (1 - s.hb)).toFixed(3)})`,
    }
    const dwStyle: React.CSSProperties = {
      transform: `translateX(${Math.round(-340 * (1 - ez(s.dwp)))}px)`,
    }

    const barOf = (pct: number) => ({
      display: 'block',
      height: 6,
      borderRadius: 3,
      background: '#3ecf8e',
      width: `${pct}%`,
    })

    return (
      <div className="ipad-viewport-wrapper">
        <div className="ipad-scaler" style={{ transform: `scale(${s.scale})` }}>
          <div
            style={{
              width: 900,
              height: 1260,
              boxSizing: 'border-box',
              padding: 40,
              borderRadius: 68,
              background: '#24262d',
              position: 'relative',
              boxShadow: 'inset 0 0 0 3px #3a3d46',
            }}
          >
            {/* Camera dot */}
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: '50%',
                marginLeft: -5,
                width: 10,
                height: 10,
                borderRadius: 5,
                background: '#0a0a0c',
              }}
            />

            {/* Inner screen frame */}
            <div
              style={{
                width: 820,
                height: 1180,
                borderRadius: 30,
                background: '#0e0f14',
                color: '#e8eaf0',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Main Content Area */}
              <main
                style={{
                  flex: 1,
                  position: 'relative',
                  overflow: 'hidden',
                  padding: (showResults && s.screen === 'browse') ? 0 : '0 108px',
                  boxSizing: 'border-box',
                }}
              >
                {/* 1. BROWSE SCREEN */}
                {s.screen === 'browse' && (
                  <div style={{ position: 'relative', height: '100%' }}>
                    {/* Header + Favorites / Recents stack */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 'calc(50% + 52px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 32,
                        clipPath: `inset(0 0 ${clipBv}px 0)`,
                        opacity: ph === 'rfade' ? s.sp : 1,
                        pointerEvents: sq ? 'none' : 'auto',
                      }}
                    >
                      {/* Logo and Brand Title */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 14,
                            background: '#7c5cff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <div
                            style={{
                              borderLeft: '16px solid #fff',
                              borderTop: '9px solid transparent',
                              borderBottom: '9px solid transparent',
                              marginLeft: 4,
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 34, fontWeight: 700 }}>Video Downloader</div>
                      </div>

                      <div style={{ position: 'relative', width: '100%', maxWidth: 560 }}>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 32,
                            opacity: (1 - s.pv).toFixed(3),
                            pointerEvents: s.pv < 0.5 ? 'auto' : 'none',
                          }}
                        >
                          {/* Favorites Section */}
                          <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#9aa3b2' }}>Favorites</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                {...fm}
                                style={{
                                  touchAction: 'pan-y',
                                  cursor: 'grab',
                                  flex: 1,
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  maskImage: 'linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)',
                                  WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    width: 'max-content',
                                    transform: `translateX(${norm(s.fx, fw)}px)`,
                                  }}
                                >
                                  {favView.map((f, idx) => (
                                    <button
                                      key={`f1-${idx}`}
                                      onClick={f.open}
                                      style={{
                                        width: f.w,
                                        opacity: f.o,
                                        overflow: 'hidden',
                                        flex: 'none',
                                        minHeight: 96,
                                        background: 'none',
                                        color: '#e8eaf0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 10,
                                      }}
                                    >
                                      <span
                                        style={{
                                          flex: 'none',
                                          width: 60,
                                          height: 60,
                                          borderRadius: 16,
                                          background: f.bg,
                                          color: f.ink,
                                          fontSize: 20,
                                          fontWeight: 700,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        {f.letter}
                                      </span>
                                      <span style={{ fontSize: 13 }}>{f.label}</span>
                                    </button>
                                  ))}
                                  <div aria-hidden="true" style={{ display: 'flex' }}>
                                    {favView.map((g, idx) => (
                                      <button
                                        key={`f2-${idx}`}
                                        onClick={g.open}
                                        style={{
                                          width: g.w,
                                          opacity: g.o,
                                          overflow: 'hidden',
                                          flex: 'none',
                                          minHeight: 96,
                                          background: 'none',
                                          color: '#e8eaf0',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: 10,
                                        }}
                                      >
                                        <span
                                          style={{
                                            flex: 'none',
                                            width: 60,
                                            height: 60,
                                            borderRadius: 16,
                                            background: g.bg,
                                            color: g.ink,
                                            fontSize: 20,
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          {g.letter}
                                        </span>
                                        <span style={{ fontSize: 13 }}>{g.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <button
                                aria-label="Add favorite"
                                onClick={() => {
                                  this.nm = ''
                                  this.ad = ''
                                  this.setState({ adding: true, pick: 0 })
                                }}
                                style={{
                                  flex: 'none',
                                  width: 84,
                                  minHeight: 96,
                                  background: 'none',
                                  color: '#9aa3b2',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 10,
                                }}
                              >
                                <span
                                  style={{
                                    width: 60,
                                    height: 60,
                                    borderRadius: 16,
                                    boxSizing: 'border-box',
                                    border: '2px dashed #4a5068',
                                    fontSize: 28,
                                    color: '#b7a6ff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  +
                                </span>
                                <span style={{ fontSize: 13 }}>Add</span>
                              </button>
                            </div>
                          </div>

                          {/* Recent Searches Section */}
                          <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#9aa3b2' }}>Recent searches</div>
                            <div
                              {...rm}
                              style={{
                                touchAction: 'pan-y',
                                cursor: 'grab',
                                overflow: 'hidden',
                                maskImage: 'linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)',
                                WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  width: 'max-content',
                                  transform: `translateX(${norm(s.rx, rw)}px)`,
                                }}
                              >
                                {rawRecents.map((t, idx) => (
                                  <button
                                    key={`r1-${idx}`}
                                    onClick={start('rec:' + t, t, 'rx')}
                                    style={{
                                      opacity: mine('rec:' + t),
                                      width: 120,
                                      flex: 'none',
                                      minHeight: 96,
                                      background: 'none',
                                      color: '#e8eaf0',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 10,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 60,
                                        height: 60,
                                        borderRadius: 16,
                                        background: '#2d2a55',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2">
                                        <circle cx="12" cy="12" r="9" />
                                        <path d="M12 7v5l3 2" />
                                      </svg>
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 13,
                                        textAlign: 'center',
                                        maxWidth: 104,
                                        overflow: 'hidden',
                                        whiteSpace: 'nowrap',
                                        textOverflow: 'ellipsis',
                                      }}
                                    >
                                      {clip(t)}
                                    </span>
                                  </button>
                                ))}
                                <div aria-hidden="true" style={{ display: 'flex' }}>
                                  {rawRecents.map((q, idx) => (
                                    <button
                                      key={`r2-${idx}`}
                                      onClick={start('rec:' + q, q, 'rx')}
                                      style={{
                                        opacity: mine('rec:' + q),
                                        width: 120,
                                        flex: 'none',
                                        minHeight: 96,
                                        background: 'none',
                                        color: '#e8eaf0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 10,
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 60,
                                          height: 60,
                                          borderRadius: 16,
                                          background: '#2d2a55',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2">
                                          <circle cx="12" cy="12" r="9" />
                                          <path d="M12 7v5l3 2" />
                                        </svg>
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 13,
                                          textAlign: 'center',
                                          maxWidth: 104,
                                          overflow: 'hidden',
                                          whiteSpace: 'nowrap',
                                          textOverflow: 'ellipsis',
                                        }}
                                      >
                                        {clip(q)}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Private Browsing Badge Overlay */}
                        <div style={{ position: 'absolute', inset: 0, opacity: s.pv.toFixed(3), pointerEvents: 'none' }}>
                          <div
                            style={{
                              boxSizing: 'border-box',
                              width: '100%',
                              height: '100%',
                              borderRadius: 28,
                              background: '#171326',
                              boxShadow: 'inset 0 0 0 1.5px #3b2f6b',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 16,
                            }}
                          >
                            <span
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 18,
                                background: '#2d2a55',
                                color: '#b7a6ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3l18 18" />
                                <path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4.2 9.5 6a14 14 0 01-2.7 3.3M6.4 7.6A14 14 0 002.5 12c1 1.8 4.5 6 9.5 6a9.8 9.8 0 004-.9" />
                                <path d="M9.9 9.9a3 3 0 004.2 4.2" />
                              </svg>
                            </span>
                            <div style={{ fontSize: 26, fontWeight: 700 }}>Private Browsing</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '50%',
                        marginTop: -30,
                        display: 'flex',
                        justifyContent: 'center',
                        transform: `translateY(${barOff}px)`,
                        zIndex: 35,
                        pointerEvents: 'auto',
                      }}
                    >
                      <div style={{ position: 'relative', width: '100%', maxWidth: barW }}>
                        <div
                          style={{
                            position: 'absolute',
                            left: -5,
                            right: -5,
                            top: -5,
                            bottom: -5,
                            borderRadius: 35,
                            border: '2px solid #b7a6ff',
                            boxShadow:
                              '0 0 22px 4px rgba(124,92,255,.85),inset 0 0 14px rgba(124,92,255,.5)',
                            opacity: laser,
                            pointerEvents: 'none',
                          }}
                        />
                        {runner && (
                          <svg
                            width="502"
                            height="70"
                            viewBox="0 0 502 70"
                            fill="none"
                            style={{
                              position: 'absolute',
                              left: -5,
                              top: -5,
                              pointerEvents: 'none',
                              opacity: runOp,
                              filter: 'drop-shadow(0 0 7px #9b83ff)',
                            }}
                          >
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#7c5cff"
                              strokeOpacity={rr[4].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[4].da}
                              strokeDashoffset={rr[4].off}
                            />
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#9b83ff"
                              strokeOpacity={rr[3].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[3].da}
                              strokeDashoffset={rr[3].off}
                            />
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#b7a6ff"
                              strokeOpacity={rr[2].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[2].da}
                              strokeDashoffset={rr[2].off}
                            />
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#d6ccff"
                              strokeOpacity={rr[1].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[1].da}
                              strokeDashoffset={rr[1].off}
                            />
                            <rect
                              x="1.5"
                              y="1.5"
                              width="499"
                              height="67"
                              rx="33.5"
                              stroke="#ffffff"
                              strokeOpacity={rr[0].op}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={rr[0].da}
                              strokeDashoffset={rr[0].off}
                            />
                          </svg>
                        )}
                        {loading && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              top: 76,
                              textAlign: 'center',
                              fontSize: 13,
                              color: '#9aa3b2',
                            }}
                          >
                            {status}
                          </div>
                        )}
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#9aa3b2"
                          strokeWidth="2"
                          style={{ position: 'absolute', left: 22, top: 19 }}
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="M20 20l-4-4" />
                        </svg>
                        <input
                          type="text"
                          aria-label="Search or paste a link"
                          placeholder="Search or paste a link"
                          value={qText}
                          onChange={(e) => this.setState({ q: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            const t = (s.q || '').trim()
                            if (!t) return
                            this.executeSearch(t)
                          }}
                          style={{
                            width: '100%',
                            height: 60,
                            boxSizing: 'border-box',
                            borderRadius: 30,
                            border: 0,
                            background: '#1d2029',
                            color: `rgba(232,234,240,${qAlpha})`,
                            fontSize: 17,
                            fontFamily: 'inherit',
                            padding: s.q ? '0 52px 0 58px' : '0 24px 0 58px',
                            boxShadow: '0 8px 28px rgba(0,0,0,.35)',
                          }}
                        />
                        {s.q && (
                          <button
                            aria-label="Clear search"
                            onClick={() => this.setState({ q: '' })}
                            style={{
                              position: 'absolute',
                              right: 20,
                              top: 20,
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              background: '#2d3142',
                              color: '#9aa3b2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              border: 0,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {showResults && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: 114,
                          bottom: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          background: '#0e0f14',
                          zIndex: 15,
                          opacity: resOp,
                          transform: `translateY(${resY}px)`,
                          transition: 'opacity 0.2s ease-out',
                        }}
                      >
                        {/* Live Browser Surface — fills 100% of the space on the sides edge to edge like Safari */}
                        <div
                          className="browser-slot"
                          style={{
                            flex: 1,
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden',
                            background: '#0d0e14',
                            position: 'relative',
                          }}
                        >
                          <iframe
                            className="safari-webview-frame"
                            title="Browsing Session"
                            src={s.webviewSrc || `/api/webview-search?q=${encodeURIComponent(resTitle)}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 'none',
                              display: 'block',
                              background: '#0e0f14',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. DOWNLOADS SCREEN */}
                {s.screen === 'down' && (
                  <div style={{ position: 'relative', height: '100%' }}>
                    <div
                      onScroll={onSc('dl')}
                      style={{
                        height: '100%',
                        boxSizing: 'border-box',
                        overflowY: 'auto',
                        padding: '58px 0 28px',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: 680,
                          margin: '0 auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 16,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              background: '#7c5cff',
                              boxShadow: '0 8px 28px rgba(124,92,255,.45)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <div
                              style={{
                                borderLeft: '13px solid #fff',
                                borderTop: '8px solid transparent',
                                borderBottom: '8px solid transparent',
                                marginLeft: 3,
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 700 }}>Downloads</div>
                          <div style={{ fontSize: 16, color: '#9aa3b2' }}>
                            {dlActive} active · {dlActive ? '5.8 MB/s' : 'idle'}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            alignItems: 'center',
                            padding: '14px 16px',
                            borderRadius: 16,
                            background: 'rgba(245,184,74,.12)',
                            boxShadow: 'inset 0 0 0 1px rgba(245,184,74,.35)',
                            color: '#f5b84a',
                            fontSize: 15,
                          }}
                        >
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
                            <path d="M12 4l9 16H3z" />
                            <path d="M12 10v4M12 17v.5" />
                          </svg>
                          <span>Storage space: 42 GB available. Unlimited parallel transfers active.</span>
                        </div>

                        {dlRows.length === 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0', textAlign: 'center' }}>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 12,
                                background: '#7c5cff',
                                boxShadow: '0 8px 28px rgba(124,92,255,.45)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <div
                                style={{
                                  borderLeft: '13px solid #fff',
                                  borderTop: '8px solid transparent',
                                  borderBottom: '8px solid transparent',
                                  marginLeft: 3,
                                }}
                              />
                            </div>
                            <div style={{ fontSize: 17, color: '#c9cedb', maxWidth: 420 }}>
                              No active transfers right now. Search any video or paste a link to download!
                            </div>
                            <button
                              onClick={() => this.setState({ screen: 'browse' })}
                              style={{
                                minHeight: 52,
                                padding: '0 28px',
                                borderRadius: 26,
                                background: '#7c5cff',
                                color: '#fff',
                                fontSize: 17,
                                fontWeight: 700,
                              }}
                            >
                              Go to Search
                            </button>
                          </div>
                        )}

                        {dlRows.map((r, i) => (
                          <div key={i} style={{ animation: `vdpop .42s cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${i * 40}ms` }}>
                            <div style={{ padding: 16, borderRadius: 20, background: '#181a22', display: 'flex', flexDirection: 'column', gap: 12 }}>
                              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <button
                                  aria-label="Details"
                                  onClick={r.toggleEx}
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    gap: 14,
                                    alignItems: 'center',
                                    background: 'none',
                                    color: 'inherit',
                                    textAlign: 'left',
                                    padding: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      flex: 'none',
                                      padding: 3,
                                      borderRadius: 16,
                                      background: `conic-gradient(${r.isErr ? '#ff7a9c' : r.color} ${r.isErr ? 100 : r.pct}%,#2b3140 0)`,
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 84,
                                        height: 58,
                                        borderRadius: 13,
                                        background: 'linear-gradient(135deg,#34304f,#1a1c27)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {r.audio ? (
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M9 18V6l10-2v12" />
                                          <circle cx="6.5" cy="18" r="2.5" />
                                          <circle cx="16.5" cy="16" r="2.5" />
                                        </svg>
                                      ) : (
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.8" strokeLinejoin="round">
                                          <rect x="3" y="5" width="18" height="14" rx="3" />
                                          <path d="M10 9.5v5l4.5-2.5z" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <div style={{ fontSize: 17, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                      {r.title}
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: r.subInk }}>{r.sub}</div>
                                  </div>
                                </button>
                                {r.canPause && (
                                  <button
                                    aria-label={r.pauseLbl}
                                    onClick={r.togglePause}
                                    style={{
                                      flex: 'none',
                                      width: 48,
                                      height: 48,
                                      borderRadius: 24,
                                      background: '#232736',
                                      color: '#e8eaf0',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {r.notPaused ? (
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <rect x="6" y="5" width="4" height="14" rx="1.2" />
                                        <rect x="14" y="5" width="4" height="14" rx="1.2" />
                                      </svg>
                                    ) : (
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M8 5v14l11-7z" />
                                      </svg>
                                    )}
                                  </button>
                                )}
                                <button
                                  aria-label="Remove from list"
                                  onClick={r.remove}
                                  style={{
                                    flex: 'none',
                                    width: 48,
                                    height: 48,
                                    borderRadius: 24,
                                    background: '#232736',
                                    color: '#e8eaf0',
                                    fontSize: 24,
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                              {r.showBar && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ height: 6, borderRadius: 3, background: '#2b3140' }}>
                                    <div
                                      style={{
                                        display: 'block',
                                        height: 6,
                                        borderRadius: 3,
                                        background: r.color,
                                        width: `${r.pct}%`,
                                      }}
                                    />
                                  </div>
                                  <div style={{ fontSize: 14, color: '#9aa3b2' }}>{r.meta}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={thumb('dl')} />
                  </div>
                )}

                {/* 3. LIBRARY SCREEN */}
                {s.screen === 'lib' && (
                  <div style={{ position: 'relative', height: '100%' }}>
                    <div
                      onScroll={onSc('lib')}
                      style={{
                        height: '100%',
                        boxSizing: 'border-box',
                        overflowY: 'auto',
                        padding: '58px 0 96px',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: cards ? 1100 : 680,
                          margin: '0 auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 16,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              background: '#7c5cff',
                              boxShadow: '0 8px 28px rgba(124,92,255,.45)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <div
                              style={{
                                borderLeft: '13px solid #fff',
                                borderTop: '8px solid transparent',
                                borderBottom: '8px solid transparent',
                                marginLeft: 3,
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 700 }}>Library</div>
                          <div style={{ fontSize: 16, color: '#9aa3b2' }}>
                            {(mbTotal >= 1024 ? (mbTotal / 1024).toFixed(1) + ' GB' : mbTotal + ' MB') +
                              ' in ' +
                              libAll.length +
                              ' files · 42 GB free'}
                          </div>
                        </div>

                        {/* Filter Chips */}
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => this.setState({ lf: 0, ld: null })} style={chip(s.lf === 0)}>
                            All
                          </button>
                          <button onClick={() => this.setState({ lf: 1, ld: null })} style={chip(s.lf === 1)}>
                            Video
                          </button>
                          <button onClick={() => this.setState({ lf: 2, ld: null })} style={chip(s.lf === 2)}>
                            Audio
                          </button>
                        </div>

                        {/* Search in Library */}
                        <div style={{ position: 'relative' }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9aa3b2" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 20, top: 19 }}>
                            <circle cx="11" cy="11" r="7" />
                            <path d="M20 20l-4-4" />
                          </svg>
                          <input
                            type="text"
                            aria-label="Search Library"
                            placeholder="Search Library"
                            value={s.lq}
                            onInput={(e: any) => this.setState({ lq: e.target.value })}
                            style={{
                              width: '100%',
                              height: 60,
                              boxSizing: 'border-box',
                              borderRadius: 30,
                              border: 0,
                              background: '#1d2029',
                              color: '#e8eaf0',
                              fontSize: 17,
                              fontFamily: 'inherit',
                              padding: '0 24px 0 54px',
                              boxShadow: '0 8px 28px rgba(0,0,0,.35)',
                            }}
                          />
                        </div>

                        {/* Empty Library state */}
                        {libRows.length === 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0', textAlign: 'center' }}>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 12,
                                background: '#7c5cff',
                                boxShadow: '0 8px 28px rgba(124,92,255,.45)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <div
                                style={{
                                  borderLeft: '13px solid #fff',
                                  borderTop: '8px solid transparent',
                                  borderBottom: '8px solid transparent',
                                  marginLeft: 3,
                                }}
                              />
                            </div>
                            <div style={{ fontSize: 17, color: '#c9cedb', maxWidth: 420 }}>
                              {qs ? 'No matches for that search.' : 'Nothing here yet. Search and download videos to build your library!'}
                            </div>
                            <button
                              onClick={() => this.setState({ screen: 'browse' })}
                              style={{
                                minHeight: 52,
                                padding: '0 28px',
                                borderRadius: 26,
                                background: '#7c5cff',
                                color: '#fff',
                                fontSize: 17,
                                fontWeight: 700,
                              }}
                            >
                              Go to Search
                            </button>
                          </div>
                        )}

                        {/* Library Grid / List */}
                        <div
                          style={{
                            display: 'grid',
                            gap: 14,
                            gridTemplateColumns: cards ? 'repeat(auto-fill,minmax(200px,1fr))' : '1fr',
                            transition: 'all .25s ease',
                          }}
                        >
                          {libRows.map((r) => (
                            <div key={r.id} style={{ position: 'relative', zIndex: s.hmenu === r.id ? 9 : 0, opacity: r.missing ? 0.55 : 1 }}>
                              {r.isCard ? (
                                <div
                                  style={{
                                    position: 'relative',
                                    height: 210,
                                    borderRadius: 22,
                                    overflow: 'hidden',
                                    background: 'linear-gradient(135deg,#3a3560,#171826)',
                                    boxShadow: r.picked ? 'inset 0 0 0 2px #7c5cff' : '0 10px 28px rgba(0,0,0,.35)',
                                    transition: 'box-shadow .25s ease',
                                  }}
                                >
                                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.28 }}>
                                    {r.audio ? (
                                      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 18V6l10-2v12" />
                                        <circle cx="6.5" cy="18" r="2.5" />
                                        <circle cx="16.5" cy="16" r="2.5" />
                                      </svg>
                                    ) : (
                                      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinejoin="round">
                                        <rect x="3" y="5" width="18" height="14" rx="3" />
                                        <path d="M10 9.5v5l4.5-2.5z" />
                                      </svg>
                                    )}
                                  </div>
                                  <button
                                    aria-label={r.title}
                                    onClick={r.tap}
                                    onPointerDown={r.down}
                                    onPointerUp={r.up}
                                    onPointerCancel={r.up}
                                    onPointerLeave={r.up}
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      width: '100%',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'flex-end',
                                      background: 'none',
                                      color: 'inherit',
                                      textAlign: 'left',
                                      padding: 0,
                                    }}
                                  >
                                    <div style={{ padding: '48px 16px 14px', background: 'linear-gradient(to top,rgba(9,10,15,.92),rgba(9,10,15,0))' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                          {r.title}
                                        </span>
                                        {r.showNew && <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 4, background: '#9d83ff' }} />}
                                      </div>
                                      {r.showSub && <div style={{ marginTop: 3, fontSize: 13, color: r.subInk }}>{r.sub}</div>}
                                    </div>
                                  </button>
                                  {r.selOn && (
                                    <span
                                      style={{
                                        position: 'absolute',
                                        left: 10,
                                        top: 10,
                                        zIndex: 2,
                                        width: 26,
                                        height: 26,
                                        borderRadius: 13,
                                        boxSizing: 'border-box',
                                        border: '2px solid #e8eaf0',
                                        background: 'rgba(0,0,0,.4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {r.picked && <span style={{ width: 16, height: 16, borderRadius: 8, background: '#7c5cff' }} />}
                                    </span>
                                  )}
                                  {r.showActs && (
                                    <button
                                      aria-label="More"
                                      onClick={r.mOpen}
                                      style={{
                                        position: 'absolute',
                                        right: 10,
                                        top: 10,
                                        width: 40,
                                        height: 40,
                                        borderRadius: 20,
                                        background: 'rgba(10,11,16,.5)',
                                        color: '#e8eaf0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="5" cy="12" r="1.8" />
                                        <circle cx="12" cy="12" r="1.8" />
                                        <circle cx="19" cy="12" r="1.8" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    position: 'relative',
                                    display: 'flex',
                                    gap: 14,
                                    alignItems: 'center',
                                    padding: '10px',
                                    borderRadius: 20,
                                    background: '#14161d',
                                    boxShadow: r.picked ? 'inset 0 0 0 2px #7c5cff' : 'inset 0 0 0 1px rgba(255,255,255,.04)',
                                    transition: 'box-shadow .25s ease',
                                  }}
                                >
                                  <button
                                    aria-label={r.title}
                                    onClick={r.tap}
                                    onPointerDown={r.down}
                                    onPointerUp={r.up}
                                    onPointerCancel={r.up}
                                    onPointerLeave={r.up}
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      display: 'flex',
                                      gap: 14,
                                      alignItems: 'center',
                                      background: 'none',
                                      color: 'inherit',
                                      textAlign: 'left',
                                      padding: 0,
                                    }}
                                  >
                                    <div
                                      style={{
                                        position: 'relative',
                                        flex: 'none',
                                        width: 96,
                                        height: 64,
                                        borderRadius: 14,
                                        overflow: 'hidden',
                                        background: 'linear-gradient(135deg,#3a3560,#171826)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {r.audio ? (
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M9 18V6l10-2v12" />
                                          <circle cx="6.5" cy="18" r="2.5" />
                                          <circle cx="16.5" cy="16" r="2.5" />
                                        </svg>
                                      ) : (
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinejoin="round">
                                          <rect x="3" y="5" width="18" height="14" rx="3" />
                                          <path d="M10 9.5v5l4.5-2.5z" />
                                        </svg>
                                      )}
                                      {r.selOn && (
                                        <span
                                          style={{
                                            position: 'absolute',
                                            left: 5,
                                            top: 5,
                                            width: 26,
                                            height: 26,
                                            borderRadius: 13,
                                            boxSizing: 'border-box',
                                            border: '2px solid #e8eaf0',
                                            background: 'rgba(0,0,0,.4)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          {r.picked && <span style={{ width: 16, height: 16, borderRadius: 8, background: '#7c5cff' }} />}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                          {r.title}
                                        </span>
                                        {r.showNew && <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 4, background: '#9d83ff' }} />}
                                      </div>
                                      <div style={{ fontSize: 13, color: r.subInk }}>{r.sub}</div>
                                    </div>
                                  </button>
                                  {r.showActs && (
                                    <button
                                      aria-label="More"
                                      onClick={r.mOpen}
                                      style={{
                                        flex: 'none',
                                        width: 44,
                                        height: 44,
                                        borderRadius: 22,
                                        background: 'none',
                                        color: '#9aa3b2',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="5" cy="12" r="1.8" />
                                        <circle cx="12" cy="12" r="1.8" />
                                        <circle cx="19" cy="12" r="1.8" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Delete confirmation inline */}
                              {r.conf && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '12px 14px',
                                    borderRadius: 14,
                                    background: 'rgba(255,122,156,.12)',
                                    boxShadow: 'inset 0 0 0 1px rgba(255,122,156,.3)',
                                    marginTop: 8,
                                  }}
                                >
                                  <span style={{ flex: 1, fontSize: 15, color: '#ffd0dc' }}>Delete this file? This can't be undone.</span>
                                  <button onClick={r.no} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, background: '#232736', color: '#e8eaf0', fontSize: 15, fontWeight: 600 }}>Cancel</button>
                                  <button onClick={r.yes} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, background: '#ff5c85', color: '#fff', fontSize: 15, fontWeight: 700 }}>Delete</button>
                                </div>
                              )}

                              {/* Item Action Popover Menu */}
                              {r.menuOn && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    right: 14,
                                    top: 14,
                                    zIndex: 9,
                                    width: 250,
                                    transformOrigin: 'top right',
                                    boxSizing: 'border-box',
                                    padding: 8,
                                    borderRadius: 20,
                                    background: '#1f2230',
                                    boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 2,
                                  }}
                                >
                                  <button onClick={r.mPlay} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5v14l11-7z" /></svg>
                                    </span>
                                    Play
                                  </button>
                                  <button onClick={r.mShare} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7" /></svg>
                                    </span>
                                    Share
                                  </button>
                                  <button onClick={r.mInfo} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
                                    </span>
                                    Info
                                  </button>
                                  <button onClick={r.mSel} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></svg>
                                    </span>
                                    Select
                                  </button>
                                  <button onClick={r.mDel} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#ff8fab' }}>
                                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: 'rgba(255,122,156,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff8fab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>
                                    </span>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={thumb('lib')} />

                    {/* Popover backdrop closer */}
                    {s.hmenu !== null && (
                      <div onClick={() => this.setState({ hmenu: null })} style={{ position: 'absolute', inset: 0, zIndex: 8 }} />
                    )}

                    {/* Bulk Selection Bar */}
                    {s.sel && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 16,
                          zIndex: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '12px 14px',
                          borderRadius: 22,
                          background: '#1f2230',
                          boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                        }}
                      >
                        {!s.selConf ? (
                          <>
                            <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{selCount} selected</span>
                            <button style={{ minHeight: 48, padding: '0 20px', borderRadius: 14, background: '#232736', color: '#e8eaf0', fontSize: 16, fontWeight: 600 }}>Share</button>
                            <button
                              onClick={() => this.setState({ selConf: true })}
                              style={{ minHeight: 48, padding: '0 20px', borderRadius: 14, background: 'rgba(255,122,156,.16)', color: '#ff7a9c', fontSize: 16, fontWeight: 600 }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 1, fontSize: 15, color: '#ffd0dc' }}>Delete {selCount} files? This can't be undone.</span>
                            <button onClick={() => this.setState({ selConf: false })} style={{ minHeight: 48, padding: '0 18px', borderRadius: 12, background: '#232736', color: '#e8eaf0', fontSize: 15, fontWeight: 600 }}>Cancel</button>
                            <button
                              onClick={() => {
                                const nextLib = s.lib.filter((x) => !s.selIds.includes(x.id))
                                this.setState({
                                  lib: nextLib,
                                  jobs: s.jobs.filter((x) => !s.selIds.includes('j' + x.id)),
                                  sel: false,
                                  selIds: [],
                                  selConf: false,
                                }, this.saveStorage)
                              }}
                              style={{ minHeight: 48, padding: '0 18px', borderRadius: 12, background: '#ff5c85', color: '#fff', fontSize: 15, fontWeight: 700 }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Info Sheet & Storage Sheet Bottom Drawer */}
                    {(!!infoItem || s.stOpen) && (
                      <>
                        <div onClick={() => this.setState({ info: null, stOpen: false })} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,.55)' }} />
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 21,
                            boxSizing: 'border-box',
                            padding: 24,
                            borderRadius: '24px 24px 0 0',
                            background: '#1f2230',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14,
                            boxShadow: '0 -16px 40px rgba(0,0,0,.5),inset 0 1px 0 #2d3144',
                          }}
                        >
                          <div style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, background: '#3a3f55' }} />
                          {infoItem && (
                            <>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>{infoItem.title}</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 20px', fontSize: 15 }}>
                                <span style={{ color: '#9aa3b2' }}>Format</span><span>{infoItem.fmt}</span>
                                <span style={{ color: '#9aa3b2' }}>Size</span><span>{infoItem.size}</span>
                                <span style={{ color: '#9aa3b2' }}>Duration</span><span>{infoItem.dur || '—'}</span>
                                <span style={{ color: '#9aa3b2' }}>Saved</span><span>{infoItem.when}</span>
                                <span style={{ color: '#9aa3b2' }}>Source</span><span>{infoItem.src}</span>
                              </div>
                              <button
                                onClick={() => {
                                  this.setState({
                                    info: null,
                                    screen: 'browse',
                                    seq: { key: 'typed', text: infoItem.src, phase: 'scan' },
                                    q: infoItem.src,
                                  })
                                }}
                                style={{ minHeight: 52, borderRadius: 14, background: '#7c5cff', color: '#fff', fontSize: 17, fontWeight: 700 }}
                              >
                                Open source page
                              </button>
                            </>
                          )}
                          {s.stOpen && (
                            <>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>Storage</div>
                              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#2b3140' }}>
                                <div style={{ width: `${(vMb / tMb * 100).toFixed(2)}%`, minWidth: 4, background: '#7c5cff' }} />
                                <div style={{ width: `${(aMb / tMb * 100).toFixed(2)}%`, minWidth: 4, background: '#3ecf8e' }} />
                              </div>
                              <div style={{ display: 'flex', gap: 18, fontSize: 14, color: '#9aa3b2' }}>
                                <span>Video {fmtMb(vMb)}</span>
                                <span>Audio {fmtMb(aMb)}</span>
                                <span>Free 42 GB</span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#9aa3b2' }}>Largest files</div>
                              {largest.map((l, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{l.title}</span>
                                  <span style={{ color: '#9aa3b2' }}>{l.size}</span>
                                </div>
                              ))}
                              <button
                                onClick={() => this.setState({ stOpen: false, sel: true, selIds: [...libAll].sort((a, b) => b.mb - a.mb).slice(0, 3).map((r) => r.id) })}
                                style={{ minHeight: 52, borderRadius: 14, background: '#232736', color: '#e8eaf0', fontSize: 16, fontWeight: 600 }}
                              >
                                Select large files
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </main>

              {/* In-App Live HTML5 Video Player Modal */}
              {s.playingMedia && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 200,
                    background: 'rgba(0,0,0,.92)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 760,
                      background: '#161822',
                      borderRadius: 24,
                      overflow: 'hidden',
                      boxShadow: '0 24px 64px rgba(0,0,0,.8)',
                      border: '1px solid #2d3144',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #262a3a' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 620 }}>
                        {s.playingMedia.title}
                      </div>
                      <button
                        onClick={() => this.setState({ playingMedia: null, playing: '' })}
                        style={{ width: 36, height: 36, borderRadius: 18, background: '#262a3a', color: '#fff', fontSize: 20 }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ width: '100%', height: 420, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.playingMedia.audio ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                          <div style={{ width: 90, height: 90, borderRadius: 45, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M9 18V6l10-2v12" />
                              <circle cx="6.5" cy="18" r="2.5" />
                              <circle cx="16.5" cy="16" r="2.5" />
                            </svg>
                          </div>
                          <audio src={s.playingMedia.url} controls autoPlay style={{ width: 440 }} />
                        </div>
                      ) : (
                        <video
                          src={s.playingMedia.url}
                          controls
                          autoPlay
                          playsInline
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Floating Download Button on Home */}
              {s.screen === 'browse' && !s.sheet && !s.sw && !s.dw && (
                <button
                  aria-label="Download"
                  onClick={() => this.setState({ sheet: true })}
                  style={{
                    position: 'absolute',
                    right: 28,
                    bottom: (s.jobs.some((j) => j.status === 'downloading') || !!s.playing) ? 112 : 28,
                    zIndex: 3,
                    minHeight: 60,
                    padding: '0 24px 0 18px',
                    borderRadius: 30,
                    background: '#7c5cff',
                    color: '#fff',
                    fontSize: 18,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    boxShadow: '0 12px 32px rgba(0,0,0,.5)',
                  }}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" />
                  </svg>
                  {s.detectedVideo ? `Save Video` : `Download`}
                </button>
              )}

              {/* Bottom Transfer Strip / Playing bar */}
              {(active.length > 0 || !!s.playing) && (
                <button
                  onClick={() => (first ? this.setState({ screen: 'down' }) : this.setState({ playing: '', playingMedia: null }))}
                  style={{
                    position: 'absolute',
                    left: 108,
                    right: 108,
                    bottom: 24,
                    minHeight: 68,
                    boxShadow: '0 12px 32px rgba(0,0,0,.5)',
                    padding: '0 20px',
                    borderRadius: 20,
                    background: '#232736',
                    color: '#e8eaf0',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 10,
                    zIndex: 10,
                  }}
                >
                  <span style={{ fontSize: 14 }}>
                    {first
                      ? 'Downloading ' + first.title + ' · ' + first.pct + '%'
                      : 'Now playing: ' + s.playing + ' (tap to stop)'}
                  </span>
                  <span style={{ display: 'block', height: 6, borderRadius: 3, background: '#363c50' }}>
                    <span style={barOf(first ? first.pct : 100)} />
                  </span>
                </button>
              )}

              {/* Left Navigation Rail */}
              <div
                style={{
                  position: 'absolute',
                  left: 20,
                  top: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  zIndex: 40,
                }}
              >
                <nav style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <button
                    aria-label="Home"
                    onClick={() => {
                      if (s.screen !== 'browse') {
                        this.setState({ screen: 'browse', webviewSrc: '', webviewUrl: '', seq: null, q: '' })
                        return
                      }
                      if (s.seq && (s.seq.phase === 'load' || s.seq.phase === 'done')) {
                        this.setState({ seq: { ...s.seq, phase: 'rdown' }, sp: 0 })
                      } else {
                        this.setState({
                          seq: { key: 'home', text: '', phase: 'rdown' },
                          sp: 0,
                          webviewSrc: '',
                          webviewUrl: '',
                        })
                      }
                    }}
                    style={navStyle(s.screen === 'browse')}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
                    </svg>
                  </button>
                  <button
                    aria-label="Downloads"
                    onClick={() => this.setState({ screen: 'down' })}
                    style={navStyle(s.screen === 'down')}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" />
                    </svg>
                    {dlActive > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          minWidth: 20,
                          height: 20,
                          borderRadius: 10,
                          background: dlFailed ? '#ff7a9c' : '#3ecf8e',
                          color: '#06130d',
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {dlActive}
                      </span>
                    )}
                  </button>
                  <button
                    aria-label="Library"
                    onClick={() => this.setState({ screen: 'lib' })}
                    style={navStyle(s.screen === 'lib')}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="5" width="18" height="14" rx="3" />
                      <path d="M10 9.5v5l4.5-2.5z" />
                    </svg>
                    {libAll.some((r) => r.isNew) && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          background: '#7c5cff',
                          boxShadow: '0 0 0 2px #0e0f14',
                        }}
                      />
                    )}
                  </button>
                </nav>
              </div>

              {/* Top Navigation Bar Elements (when not in downloads screen) */}
              {s.screen !== 'down' && (
                <>
                  {/* Home / Menu Button */}
                  <button
                    aria-label={isHomeNow ? 'Menu' : 'Home'}
                    onClick={() => {
                      if (isHomeNow) {
                        this.setState({ dw: true })
                        return
                      }
                      if (s.screen !== 'browse') {
                        this.setState({ screen: 'browse' })
                        return
                      }
                      if (s.seq && (s.seq.phase === 'load' || s.seq.phase === 'done')) {
                        this.setState({ seq: { ...s.seq, phase: 'rdown' }, sp: 0 })
                      } else {
                        this.setState({
                          seq: { key: 'home', text: '', phase: 'rdown' },
                          sp: 0,
                          webviewSrc: '',
                          webviewUrl: '',
                        })
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: 20,
                      top: 48,
                      width: 60,
                      height: 60,
                      zIndex: 40,
                      background: 'none',
                      color: '#e8eaf0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                    }}
                  >
                    <span style={{ position: 'relative', display: 'block', width: 32, height: 32 }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={hbStyle}>
                        <path d="M4 7h16M4 12h16M4 17h16" />
                      </svg>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" style={hhStyle}>
                        <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
                      </svg>
                    </span>
                  </button>

                  {/* Back / Forward chevrons */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 86,
                      top: 48,
                      zIndex: 40,
                      display: 'flex',
                      gap: 0,
                      opacity:
                        (showResults || ph === 'done')
                          ? 1
                          : ph === 'rdown'
                            ? Math.min(1, Math.max(0, 1 - (barOff + 512) / 132))
                            : 0,
                      pointerEvents: (showResults || ph === 'done') ? 'auto' : 'none',
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    <button
                      aria-label="Back"
                      onClick={() => {
                        if (s.screen !== 'browse') {
                          this.setState({ screen: 'browse' })
                          return
                        }
                        try {
                          const iframe = document.querySelector('iframe.safari-webview-frame') as HTMLIFrameElement
                          if (iframe?.contentWindow && window.history.length > 1) {
                            iframe.contentWindow.history.back()
                            return
                          }
                        } catch {}
                        if (s.seq && (s.seq.phase === 'load' || s.seq.phase === 'done')) {
                          this.setState({ seq: { ...s.seq, phase: 'rdown' }, sp: 0 })
                        } else {
                          this.setState({
                            seq: { key: 'home', text: '', phase: 'rdown' },
                            sp: 0,
                            webviewSrc: '',
                            webviewUrl: '',
                          })
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 38,
                        height: 60,
                        background: 'none',
                        color: '#e8eaf0',
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                      }}
                    >
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 5l-7 7 7 7" />
                      </svg>
                    </button>
                    <button
                      aria-label="Forward"
                      onClick={() => {
                        try {
                          const iframe = document.querySelector('iframe.safari-webview-frame') as HTMLIFrameElement
                          if (iframe?.contentWindow) iframe.contentWindow.history.forward()
                        } catch {}
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 38,
                        height: 60,
                        background: 'none',
                        color: '#e8eaf0',
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                        opacity: 0.85,
                        cursor: 'pointer',
                      }}
                    >
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* Top Right: New Tab & Switcher */}
                  <div style={{ position: 'absolute', right: 20, top: 48, zIndex: 40, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      aria-label="New tab"
                      onClick={newTab}
                      onPointerDown={() => {
                        this.held = false
                        clearTimeout(this.ht)
                        this.ht = setTimeout(() => {
                          this.ht = null
                          const st = this.state
                          if (st.screen === 'browse' && !st.seq && !st.sw && !st.adding && !st.nph) {
                            this.held = true
                            this.setState({ hm: true, tm: false })
                          }
                        }, 450)
                      }}
                      onPointerUp={() => {
                        clearTimeout(this.ht)
                        this.ht = null
                      }}
                      onPointerCancel={() => {
                        clearTimeout(this.ht)
                        this.ht = null
                      }}
                      onPointerLeave={() => {
                        clearTimeout(this.ht)
                        this.ht = null
                      }}
                      style={{
                        width: 60,
                        height: 60,
                        background: 'none',
                        color: '#e8eaf0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity:
                          (s.tabs.length + 1 >= 10 ? 0.4 : 1) *
                          (s.nph === 'slide' ? Math.max(0, Math.min(1, (s.npp - 0.55) / 0.4)) : 1),
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                      }}
                    >
                      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    <button
                      aria-label="Show tabs"
                      onClick={() => {
                        if (this.held2) {
                          this.held2 = false
                          return
                        }
                        this.setState({ sw: true, swt: 0, swm: s.cpriv, pm: false })
                      }}
                      onPointerDown={() => {
                        this.held2 = false
                        clearTimeout(this.ht2)
                        this.ht2 = setTimeout(() => {
                          this.ht2 = null
                          const st = this.state
                          if (!st.sw && !st.nz && !st.nph && !st.adding && !st.dw) {
                            this.held2 = true
                            this.setState({ tm: true, hm: false })
                          }
                        }, 450)
                      }}
                      onPointerUp={() => {
                        clearTimeout(this.ht2)
                        this.ht2 = null
                      }}
                      onPointerCancel={() => {
                        clearTimeout(this.ht2)
                        this.ht2 = null
                      }}
                      onPointerLeave={() => {
                        clearTimeout(this.ht2)
                        this.ht2 = null
                      }}
                      style={{
                        position: 'relative',
                        width: 60,
                        height: 60,
                        background: 'none',
                        color: '#e8eaf0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                      }}
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                        <rect x="7" y="3" width="14" height="14" rx="3" />
                        <rect x="3" y="7" width="14" height="14" rx="3" fill="#0e0f14" />
                      </svg>
                      <span
                        style={{
                          position: 'absolute',
                          left: 19,
                          top: 25,
                          width: 16,
                          height: 16,
                          lineHeight: '16px',
                          textAlign: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {s.tabs.length + 1}
                      </span>
                    </button>
                  </div>

                  {/* Recently Visited Dropdown Menu */}
                  {s.hm && (
                    <>
                      <div onClick={() => this.setState({ hm: false })} style={{ position: 'absolute', inset: 0 }} />
                      <div
                        style={{
                          position: 'absolute',
                          left: 414,
                          top: 116,
                          width: 320,
                          boxSizing: 'border-box',
                          padding: 10,
                          borderRadius: 22,
                          background: '#1f2230',
                          boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                          opacity: s.hmp,
                          transform: `translateY(${Math.round((1 - s.hmp) * -8)}px) scale(${(0.96 + 0.04 * s.hmp).toFixed(3)})`,
                          transformOrigin: '290px 0',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        <div style={{ padding: '6px 12px 8px', fontSize: 13, fontWeight: 600, color: '#9aa3b2' }}>
                          Recently visited
                        </div>
                        {s.hist.length === 0 && (
                          <div style={{ padding: '14px 12px', fontSize: 15, color: '#9aa3b2' }}>
                            Nothing visited yet
                          </div>
                        )}
                        {s.hist.map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              if (s.seq) return
                              this.setState({ hm: false, seq: { key: 'hist:' + t, text: t, phase: 'fade' }, sp: 0, q: t })
                            }}
                            style={{
                              minHeight: 52,
                              width: '100%',
                              boxSizing: 'border-box',
                              borderRadius: 14,
                              padding: '0 12px',
                              background: 'none',
                              color: '#e8eaf0',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 14,
                              textAlign: 'left',
                              fontSize: 16,
                            }}
                          >
                            <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 1 0 3-6.7" />
                                <path d="M3 4v5h5" />
                                <path d="M12 7v5l3 2" />
                              </svg>
                            </span>
                            <span style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Horizontal Tab Pills Bar (Top + Under layers) */}
                  <div
                    onPointerDown={sDown}
                    onPointerMove={sMove}
                    onPointerUp={sUp}
                    onPointerCancel={sUp}
                    onWheel={sWheel}
                    style={{
                      position: 'absolute',
                      left: 140,
                      top: 36,
                      width: 540,
                      height: 110,
                      overflow: 'hidden',
                      touchAction: 'pan-y',
                      cursor: this.dr.sf ? 'grabbing' : 'grab',
                      pointerEvents: s.pa > 0.5 ? 'auto' : 'none',
                      maskImage: gT.over ? edge : 'none',
                      WebkitMaskImage: gT.over ? edge : 'none',
                    }}
                  >
                    {pillsTop.map((p, idx) => (
                      <button key={`pt-${idx}`} aria-label={p.title} onClick={p.go} style={p.style}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div
                    onPointerDown={sDown}
                    onPointerMove={sMove}
                    onPointerUp={sUp}
                    onPointerCancel={sUp}
                    onWheel={sWheel}
                    style={{
                      position: 'absolute',
                      left: 140,
                      top: 116,
                      width: 540,
                      height: 38,
                      overflow: 'hidden',
                      touchAction: 'pan-y',
                      cursor: this.dr.sf ? 'grabbing' : 'grab',
                      pointerEvents: s.pb > 0.5 ? 'auto' : 'none',
                      maskImage: gU.over ? edge : 'none',
                      WebkitMaskImage: gU.over ? edge : 'none',
                    }}
                  >
                    {pillsUnder.map((u, idx) => (
                      <button key={`pu-${idx}`} aria-label={u.title} onClick={u.go} style={u.style}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Downloads Screen Header Actions */}
              {s.screen === 'down' && (
                <>
                  <button
                    aria-label="Download history"
                    onClick={() => this.setState({ dh: !s.dh })}
                    style={{
                      position: 'absolute',
                      left: 20,
                      top: 48,
                      width: 60,
                      height: 60,
                      background: 'none',
                      color: '#e8eaf0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 3-6.7" />
                      <path d="M3 4v5h5" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </button>

                  <button
                    aria-label="More"
                    onClick={() => this.setState({ dm: !s.dm, dmc: false })}
                    style={{
                      position: 'absolute',
                      top: 48,
                      width: 60,
                      height: 60,
                      background: 'none',
                      color: '#e8eaf0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                      right: 20,
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                </>
              )}

              {/* Downloads Action Menu (dm) */}
              {s.dm && (
                <>
                  <div onClick={() => this.setState({ dm: false, dmc: false })} style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(8,9,13,.5)' }} />
                  <div
                    style={{
                      position: 'absolute',
                      right: 20,
                      top: 116,
                      zIndex: 6,
                      width: 280,
                      transformOrigin: 'top right',
                      boxSizing: 'border-box',
                      padding: 8,
                      borderRadius: 22,
                      background: '#1f2230',
                      boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <button
                      onClick={() => this.setState({ dp: dlRows.filter((r) => !r.isErr).map((r) => r.title), dm: false })}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
                      </span>
                      Pause all
                    </button>
                    <button
                      onClick={() => this.setState({ dp: [], dm: false })}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                      Resume all
                    </button>
                    <button
                      onClick={() => (s.dmc ? this.setState({ dr: [...s.dr, ...dlRows.map((r) => r.title)], dm: false, dmc: false }) : this.setState({ dmc: true }))}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: s.dmc ? '#ffb3c6' : '#ff8fab' }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: 'rgba(255,122,156,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff7a9c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </span>
                      {s.dmc ? 'Tap again to cancel all' : 'Cancel all'}
                    </button>
                    <button
                      onClick={() => this.setState({ dr: [...s.dr, ...dlRows.filter((r) => r.isErr).map((r) => r.title)], dm: false })}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>
                      </span>
                      Clear failed
                    </button>
                  </div>
                </>
              )}

              {/* Download History Popover (showDh) */}
              {s.screen === 'down' && s.dh && (
                <>
                  <div onClick={() => this.setState({ dh: false })} style={{ position: 'absolute', inset: 0, zIndex: 5 }} />
                  <div
                    style={{
                      position: 'absolute',
                      left: 20,
                      top: 116,
                      zIndex: 6,
                      width: 400,
                      boxSizing: 'border-box',
                      padding: 10,
                      borderRadius: 22,
                      background: '#1f2230',
                      boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 8px 12px' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#9aa3b2' }}>Download history</span>
                      <button onClick={() => this.setState({ dhRows: [], dhc: true }, this.saveStorage)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: 'none', color: '#b7a6ff', fontSize: 15, fontWeight: 600 }}>
                        Clear
                      </button>
                    </div>
                    {s.dhRows.length === 0 && (
                      <div style={{ padding: '14px 12px', fontSize: 15, color: '#9aa3b2' }}>No download history</div>
                    )}
                    {s.dhRows.map((h, idx) => (
                      <div key={idx} style={{ minHeight: 56, boxSizing: 'border-box', borderRadius: 14, padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{h.title}</span>
                        <span style={{ fontSize: 13, color: '#9aa3b2' }}>
                          {h.fmt} · {h.when} · <span style={{ color: h.ink, fontWeight: 600 }}>{h.status}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Library Screen Header Actions */}
              {s.screen === 'lib' && (
                <>
                  {!s.sel ? (
                    <>
                      <button
                        aria-label={cards ? 'Show as list' : 'Show as cards'}
                        onClick={() => this.setState({ lay: cards ? 'list' : 'cards' })}
                        style={{
                          position: 'absolute',
                          top: 48,
                          width: 60,
                          height: 60,
                          background: 'none',
                          color: '#e8eaf0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                          right: 84,
                        }}
                      >
                        {!cards ? (
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                            <rect x="3" y="3" width="8" height="8" rx="2" />
                            <rect x="13" y="3" width="8" height="8" rx="2" />
                            <rect x="3" y="13" width="8" height="8" rx="2" />
                            <rect x="13" y="13" width="8" height="8" rx="2" />
                          </svg>
                        ) : (
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                        )}
                      </button>
                      <button
                        aria-label="More"
                        onClick={() => this.setState({ lm: !s.lm })}
                        style={{
                          position: 'absolute',
                          top: 48,
                          width: 60,
                          height: 60,
                          background: 'none',
                          color: '#e8eaf0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                          right: 20,
                        }}
                      >
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="5" cy="12" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="19" cy="12" r="1.8" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => this.setState({ sel: false, selIds: [], selConf: false })}
                      style={{
                        position: 'absolute',
                        top: 48,
                        background: 'none',
                        color: '#b7a6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))',
                        right: 20,
                        width: 'auto',
                        padding: '0 12px',
                        fontSize: 20,
                        fontWeight: 700,
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </>
              )}

              {/* Library Action Menu (lm) */}
              {s.lm && (
                <>
                  <div onClick={() => this.setState({ lm: false })} style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(8,9,13,.5)' }} />
                  <div
                    style={{
                      position: 'absolute',
                      right: 20,
                      top: 116,
                      zIndex: 6,
                      width: 280,
                      transformOrigin: 'top right',
                      boxSizing: 'border-box',
                      padding: 8,
                      borderRadius: 22,
                      background: '#1f2230',
                      boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <button onClick={() => this.setState({ sel: true, selIds: [], lm: false })} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></svg>
                      </span>
                      Select
                    </button>
                    <button onClick={() => this.setState({ lm: false })} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7" /></svg>
                      </span>
                      Export All
                    </button>
                    <button onClick={() => this.setState({ stOpen: true, lm: false })} style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>
                      </span>
                      Storage details
                    </button>
                  </div>
                </>
              )}

              {/* Animated New Tab Glyph Indicator */}
              {!!s.nph && (
                <div style={npStyle}>
                  <svg width={npIc} height={npIc} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flex: 'none' }}>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span style={npLabel}>{this.privNext ? 'Private' : 'New tab'}</span>
                </div>
              )}

              {/* Tab Quick Action Popover Menu (showTm) */}
              {(s.tm || s.tmp > 0) && (
                <>
                  <div onClick={() => this.setState({ tm: false, tmc: false })} style={{ position: 'absolute', inset: 0 }} />
                  <div
                    style={{
                      position: 'absolute',
                      left: 520,
                      top: 116,
                      width: 280,
                      boxSizing: 'border-box',
                      padding: 10,
                      borderRadius: 22,
                      background: '#1f2230',
                      boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                      opacity: s.tmp,
                      transform: `translateY(${Math.round((1 - s.tmp) * -8)}px) scale(${(0.96 + 0.04 * s.tmp).toFixed(3)})`,
                      transformOrigin: '250px 0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <button
                      onClick={() => {
                        this.setState({ tm: false, tmc: false })
                        closeCurrent()
                      }}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16 }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </span>
                      Close this tab
                    </button>
                    <button
                      onClick={() => {
                        if (!s.tmc) {
                          this.setState({ tmc: true })
                          return
                        }
                        this.setState({ tm: false, tmc: false })
                        closeAll()
                      }}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: s.tmc ? 'rgba(255,122,156,.16)' : 'none', color: '#ff7a9c', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16 }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#3d1a26', color: '#ff7a9c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 8l8 8M16 8l-8 8" /><rect x="3" y="3" width="18" height="18" rx="5" /></svg>
                      </span>
                      {s.tmc ? 'Tap again to confirm' : 'Close all tabs'}
                    </button>
                    <div style={{ height: 1, margin: '6px 12px', background: '#2d3144' }} />
                    <button
                      onClick={() => {
                        this.setState({ tm: false, tmc: false })
                        this.privNext = true
                        newTab()
                      }}
                      style={{ minHeight: 52, width: '100%', boxSizing: 'border-box', borderRadius: 14, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', fontSize: 16 }}
                    >
                      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4.2 9.5 6a14 14 0 01-2.7 3.3M6.4 7.6A14 14 0 002.5 12c1 1.8 4.5 6 9.5 6a9.8 9.8 0 004-.9" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></svg>
                      </span>
                      New private tab
                    </button>
                  </div>
                </>
              )}

              {/* Format Selection Bottom Sheet (sheet) */}
              {s.sheet && (
                <>
                  <div onClick={() => this.setState({ sheet: false })} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 99 }} />
                  <aside
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: '32px 32px 0 0',
                      background: '#1f2230',
                      padding: '14px 28px 32px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      zIndex: 100,
                    }}
                  >
                    <div style={{ width: 48, height: 5, borderRadius: 3, background: '#4a5068', alignSelf: 'center' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 600 }}>Save this video</div>
                      <button aria-label="Close" onClick={() => this.setState({ sheet: false })} style={{ background: 'none', color: '#9aa3b2', fontSize: 26, minWidth: 44, minHeight: 44 }}>
                        ×
                      </button>
                    </div>
                    <div style={{ fontSize: 14, color: '#9aa3b2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.detectedVideo?.title || 'Mountain Road Timelapse'}
                    </div>
                    {fmts.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => this.setState({ fmt: f.id })}
                        style={{
                          minHeight: 64,
                          borderRadius: 16,
                          padding: '0 20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          color: '#e8eaf0',
                          background: s.fmt === f.id ? '#2d2a55' : '#272b3b',
                          boxShadow: `inset 0 0 0 2px ${s.fmt === f.id ? '#7c5cff' : 'transparent'}`,
                        }}
                      >
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{f.label}</span>
                        <span style={{ fontSize: 13, color: '#9aa3b2' }}>{f.meta}</span>
                      </button>
                    ))}
                    <button
                      onClick={this.startDownload}
                      style={{
                        marginTop: 6,
                        minHeight: 56,
                        borderRadius: 16,
                        background: '#7c5cff',
                        color: '#fff',
                        fontSize: 17,
                        fontWeight: 600,
                      }}
                    >
                      Download
                    </button>
                  </aside>
                </>
              )}

              {/* Tab Switcher Overlay (showSw) */}
              {(s.sw || s.swp > 0) && (
                <div
                  data-swroot="1"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: s.swm ? 'rgba(23,19,38,.78)' : 'rgba(14,15,20,.6)',
                    backdropFilter: 'blur(22px)',
                    WebkitBackdropFilter: 'blur(22px)',
                    opacity: s.swp,
                    transform: `scale(${0.96 + 0.04 * s.swp})`,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '72px 28px 0',
                    boxSizing: 'border-box',
                    zIndex: 50,
                  }}
                >
                  {s.pm && <div onClick={() => this.setState({ pm: false })} style={{ position: 'absolute', inset: 0, zIndex: 4 }} />}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 32,
                    }}
                  >
                    <div style={{ fontSize: 30, fontWeight: 700, color: s.swm ? '#b7a6ff' : '#e8eaf0' }}>
                      {(s.swm ? 'Private' : 'Tabs') + ' (' + swCount + ')'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button aria-label="New tab" onClick={addFromSw} style={{ width: 60, height: 60, background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                      {(s.cpriv || s.tabs.some((t) => t.priv)) && (
                        <div style={{ position: 'relative' }}>
                          <button
                            aria-label="Switch between tabs and private"
                            onClick={() => this.setState({ pm: !s.pm })}
                            style={{
                              minHeight: 56,
                              padding: '0 16px 0 20px',
                              borderRadius: 28,
                              background: s.swm ? '#2d2a55' : '#232736',
                              color: s.swm ? '#b7a6ff' : '#e8eaf0',
                              fontSize: 19,
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            {s.swm ? 'Private' : 'Tabs'}
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                          {s.pm && (
                            <div
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: 64,
                                width: 300,
                                boxSizing: 'border-box',
                                padding: 8,
                                borderRadius: 20,
                                background: '#1f2230',
                                boxShadow: '0 16px 40px rgba(0,0,0,.55),inset 0 0 0 1px #2d3144',
                                opacity: s.pmp,
                                transform: `translateY(${Math.round((1 - s.pmp) * -6)}px) scale(${(0.96 + 0.04 * s.pmp).toFixed(3)})`,
                                transformOrigin: '80% 0',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                              }}
                            >
                              <button
                                onClick={() => this.setState({ swm: false, pm: false, swt: 0 })}
                                style={{
                                  minHeight: 48,
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  borderRadius: 14,
                                  padding: '0 14px',
                                  background: s.swm ? 'none' : '#2d2a55',
                                  color: '#e8eaf0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  textAlign: 'left',
                                  fontSize: 16,
                                  fontWeight: 600,
                                }}
                              >
                                <span style={{ flex: 1 }}>{s.swm ? 'Go back to Tabs' : 'Tabs'}</span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#9aa3b2' }}>
                                  {s.tabs.filter((t) => !t.priv).length + (s.cpriv ? 0 : 1)}
                                </span>
                              </button>
                              <button
                                onClick={() => this.setState({ swm: true, pm: false, swt: 0 })}
                                style={{
                                  minHeight: 48,
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  borderRadius: 14,
                                  padding: '0 14px',
                                  background: s.swm ? '#2d2a55' : 'none',
                                  color: '#e8eaf0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  textAlign: 'left',
                                  fontSize: 16,
                                  fontWeight: 600,
                                }}
                              >
                                <span style={{ flex: 1 }}>{s.swm ? 'Stay in Private' : 'Private'}</span>
                                <span style={{ fontSize: 14, fontWeight: 500, color: '#9aa3b2' }}>
                                  {s.tabs.filter((t) => t.priv).length + (s.cpriv ? 1 : 0)}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <button onClick={closeSw} style={{ minHeight: 60, padding: '0 16px', background: 'none', color: '#b7a6ff', fontSize: 22, fontWeight: 700 }}>
                        Done
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    <div onScroll={onSc('sw')} style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingBottom: 24 }}>
                      <div style={{ position: 'relative', width: 736, margin: '0 auto', height: gridH }}>
                        {tabView.map((t) => (
                          <div key={t.id} style={t.slotStyle}>
                            <div style={t.pop}>
                              {t.isNew ? (
                                <button
                                  aria-label="New tab"
                                  onClick={t.open}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '100%',
                                    height: 480,
                                    boxSizing: 'border-box',
                                    background: 'none',
                                    color: '#b7a6ff',
                                    fontSize: 96,
                                    fontWeight: 300,
                                    border: '2px dashed #4a5068',
                                    borderRadius: 20,
                                  }}
                                >
                                  +
                                </button>
                              ) : (
                                <div style={{ display: t.dsp }}>
                                  <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#181a22' }}>
                                    <button aria-label={t.title} onClick={t.open} style={{ display: 'block', width: '100%', height: 480, padding: 0, background: 'linear-gradient(135deg,#34304f,#1a1c27)' }} />
                                    <div style={{ position: 'absolute', inset: 0, borderRadius: 20, pointerEvents: 'none', boxShadow: t.ring }} />
                                    {t.canClose && (
                                      <button aria-label="Close tab" onClick={t.close} style={{ position: 'absolute', top: 8, right: 8, width: 44, height: 44, borderRadius: 22, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 22 }}>
                                        ×
                                      </button>
                                    )}
                                  </div>
                                  <div style={{ height: 48, boxSizing: 'border-box', padding: '10px 4px 0' }}>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t.title}</div>
                                      <div style={{ fontSize: 13, color: '#9aa3b2' }}>{t.sub}</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={thumb('sw')} />
                  </div>
                </div>
              )}

              {/* Side Menu Drawer (dw) */}
              {(s.dw || s.dwp > 0) && (
                <>
                  <div onClick={() => this.setState({ dw: false })} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', opacity: s.dwp, zIndex: 60 }} />
                  <aside
                    aria-label="Menu"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 340,
                      boxSizing: 'border-box',
                      padding: '28px 20px',
                      background: '#161821',
                      boxShadow: '0 0 60px rgba(0,0,0,.6)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      zIndex: 61,
                      ...dwStyle,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 11, background: '#7c5cff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ borderLeft: '12px solid #fff', borderTop: '7px solid transparent', borderBottom: '7px solid transparent', marginLeft: 3 }} />
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>Menu</div>
                      </div>
                      <button aria-label="Close menu" onClick={() => this.setState({ dw: false })} style={{ width: 44, height: 44, borderRadius: 22, background: '#232736', color: '#e8eaf0', fontSize: 22 }}>
                        ×
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        this.setState({ dw: false, cpriv: !s.cpriv })
                      }}
                      style={{ minHeight: 60, width: '100%', boxSizing: 'border-box', borderRadius: 16, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', fontSize: 17, fontWeight: 600 }}
                    >
                      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4.2 9.5 6a14 14 0 01-2.7 3.3M6.4 7.6A14 14 0 002.5 12c1 1.8 4.5 6 9.5 6a9.8 9.8 0 004-.9" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></svg>
                      </span>
                      {s.cpriv ? 'Exit Private Mode' : 'Private'}
                    </button>

                    <button
                      onClick={() => this.setState({ dw: false, stOpen: true })}
                      style={{ minHeight: 60, width: '100%', boxSizing: 'border-box', borderRadius: 16, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', fontSize: 17, fontWeight: 600 }}
                    >
                      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
                      </span>
                      Settings &amp; Storage
                    </button>

                    <button
                      onClick={() => this.setState({ dw: false })}
                      style={{ minHeight: 60, width: '100%', boxSizing: 'border-box', borderRadius: 16, padding: '0 12px', background: 'none', color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', fontSize: 17, fontWeight: 600 }}
                    >
                      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: '#2d2a55', color: '#b7a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 010 18z" fill="currentColor" /></svg>
                      </span>
                      Theme
                    </button>
                  </aside>
                </>
              )}

              {/* Animated Zoom New Tab View */}
              {s.nz && (
                <div style={nzStyle}>
                  <span style={{ opacity: Number(Math.max(0, 1 - nzz * 2.5).toFixed(2)), lineHeight: 1 }}>+</span>
                </div>
              )}

              {/* Add Favorite Modal */}
              {(s.adding || s.mp > 0) && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}>
                  <div onClick={() => this.setState({ adding: false })} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.65)', opacity: s.mp }} />
                  <div
                    role="dialog"
                    aria-label="Add a favorite"
                    style={{
                      position: 'relative',
                      width: 520,
                      boxSizing: 'border-box',
                      padding: 28,
                      borderRadius: 28,
                      background: '#1f2230',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      boxShadow: '0 24px 80px rgba(0,0,0,.6)',
                      opacity: s.mp,
                      transform: `scale(${0.9 + 0.1 * (1 - Math.pow(1 - s.mp, 3))})`,
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 700 }}>Add a favorite</div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#9aa3b2' }}>
                      Name
                      <input
                        type="text"
                        placeholder="Optional"
                        onInput={(e: any) => { this.nm = e.target.value }}
                        style={{
                          height: 52,
                          boxSizing: 'border-box',
                          borderRadius: 14,
                          border: 0,
                          background: '#2a2e3f',
                          color: '#e8eaf0',
                          fontSize: 16,
                          fontFamily: 'inherit',
                          padding: '0 16px',
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: '#9aa3b2' }}>
                      Site address
                      <input
                        type="text"
                        placeholder="e.g. vimeo.com"
                        onInput={(e: any) => { this.ad = e.target.value }}
                        style={{
                          height: 52,
                          boxSizing: 'border-box',
                          borderRadius: 14,
                          border: 0,
                          background: '#2a2e3f',
                          color: '#e8eaf0',
                          fontSize: 16,
                          fontFamily: 'inherit',
                          padding: '0 16px',
                        }}
                      />
                    </label>
                    <div style={{ fontSize: 13, color: '#9aa3b2' }}>Icon color</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {PALETTE.map((c, i) => (
                        <button
                          key={c.name}
                          aria-label={c.name}
                          onClick={() => this.setState({ pick: i })}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 14,
                            background: c.bg,
                            boxShadow: `inset 0 0 0 3px ${s.pick === i ? c.ink : 'transparent'}`,
                            border: 0,
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        onClick={() => this.setState({ adding: false })}
                        style={{ minHeight: 48, padding: '0 22px', borderRadius: 14, background: '#2a2e3f', color: '#e8eaf0', fontSize: 15 }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          const clean = (this.ad || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
                          const label = ((this.nm || '').trim() || clean).slice(0, 14)
                          const dup = s.favs.some((f) => f.label.toLowerCase() === label.toLowerCase())
                          if (!label || dup) {
                            this.setState({ adding: false })
                            return
                          }
                          const c = PALETTE[s.pick]
                          this.pending = { url: clean || label, label, letter: label.charAt(0).toUpperCase(), bg: c.bg, ink: c.ink }
                          this.hold = true
                          this.setState({ adding: false })
                        }}
                        style={{ minHeight: 48, padding: '0 28px', borderRadius: 14, background: '#7c5cff', color: '#fff', fontSize: 15, fontWeight: 600 }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
}
