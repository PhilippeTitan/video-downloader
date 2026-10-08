import type {
  DownloadJob,
  Format,
  HealthResponse,
  NewDownloadRequest,
  VideoInfo,
} from './types'

/**
 * API client for the downloader backend.
 *
 * Live endpoints (all relative to VITE_API_BASE, default "/api"):
 *   GET    /health                  -> { ok: true, version?: string }
 *   POST   /analyze   { url }       -> VideoInfo
 *   GET    /downloads               -> DownloadJob[]
 *   POST   /downloads { url, formatId } -> DownloadJob
 *   POST   /downloads/:id/cancel    -> DownloadJob
 *   DELETE /downloads/:id           -> 204
 *   POST   /downloads/clear         -> 204 (finished jobs only)
 */

export type ApiMode = 'live' | 'demo'

export interface ApiClient {
  readonly mode: ApiMode
  readonly label: string
  health(): Promise<HealthResponse>
  analyze(url: string): Promise<VideoInfo>
  listJobs(): Promise<DownloadJob[]>
  createDownload(request: NewDownloadRequest): Promise<DownloadJob>
  cancelJob(id: string): Promise<void>
  removeJob(id: string): Promise<void>
  clearFinished(): Promise<void>
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') || '/api'
const FORCE_DEMO = String(import.meta.env.VITE_DEMO ?? '').toLowerCase() === 'true'

class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError(`Can't reach the downloader service at ${BASE}`)
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { detail?: string; error?: string }
      detail = body.detail ?? body.error ?? detail
    } catch {
      /* non-JSON error body - keep the status line */
    }
    throw new ApiError(detail)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function createLiveClient(): ApiClient {
  return {
    mode: 'live',
    label: BASE,
    health: () => request<HealthResponse>('/health'),
    analyze: (url) =>
      request<VideoInfo>('/analyze', { method: 'POST', body: JSON.stringify({ url }) }),
    listJobs: () => request<DownloadJob[]>('/downloads'),
    createDownload: (payload) =>
      request<DownloadJob>('/downloads', { method: 'POST', body: JSON.stringify(payload) }),
    cancelJob: async (id) => {
      await request(`/downloads/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
    },
    removeJob: async (id) => {
      await request(`/downloads/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    clearFinished: async () => {
      await request('/downloads/clear', { method: 'POST' })
    },
  }
}

/* ------------------------------------------------------------------------- *
 * Demo backend
 *
 * Keeps the UI fully explorable before the real downloader service exists.
 * Everything here is fake, in-memory and clearly labelled as demo mode.
 * ------------------------------------------------------------------------- */

const DEMO_FORMATS: Format[] = [
  { id: 'v-2160', label: '2160p', ext: 'mp4', kind: 'video', height: 2160, fps: 30, vcodec: 'avc1', filesizeBytes: 812_000_000 },
  { id: 'v-1440', label: '1440p', ext: 'mp4', kind: 'video', height: 1440, fps: 30, vcodec: 'avc1', filesizeBytes: 402_000_000 },
  { id: 'v-1080', label: '1080p', ext: 'mp4', kind: 'video', height: 1080, fps: 30, vcodec: 'avc1', filesizeBytes: 168_000_000 },
  { id: 'v-720', label: '720p', ext: 'mp4', kind: 'video', height: 720, fps: 30, vcodec: 'avc1', filesizeBytes: 84_000_000 },
  { id: 'v-480', label: '480p', ext: 'mp4', kind: 'video', height: 480, fps: 30, vcodec: 'avc1', filesizeBytes: 41_000_000 },
  { id: 'a-m4a', label: '128 kbps', ext: 'm4a', kind: 'audio', bitrateKbps: 128, acodec: 'mp4a', filesizeBytes: 4_600_000 },
]

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop()
    const id = parsed.searchParams.get('v') ?? last ?? parsed.hostname
    return `Demo video · ${id.slice(0, 24)}`
  } catch {
    return 'Demo video'
  }
}

interface DemoState {
  jobs: DownloadJob[]
  lastTick: number
  seq: number
}

const demo: DemoState = { jobs: [], lastTick: Date.now(), seq: 0 }

/** Advance simulated transfers based on wall-clock time since the last read. */
function tickDemo(): void {
  const now = Date.now()
  const elapsed = Math.min(now - demo.lastTick, 5000) / 1000
  demo.lastTick = now

  for (const job of demo.jobs) {
    if (job.status !== 'downloading' && job.status !== 'converting') continue
    const total = job.totalBytes ?? 50_000_000
    const headroom = Math.max(total - job.receivedBytes, 0)
    const speed = 6_000_000 + Math.random() * 9_000_000
    job.receivedBytes = Math.min(total, job.receivedBytes + speed * elapsed)
    job.speedBps = speed
    job.etaSec = speed > 0 ? headroom / speed : 0

    if (job.receivedBytes >= total) {
      if (job.status === 'downloading') {
        job.status = 'converting'
        job.speedBps = undefined
        job.receivedBytes = total
      } else {
        job.status = 'complete'
        job.speedBps = undefined
        job.etaSec = undefined
        job.completedAt = now
        job.filePath = `/downloads/${job.title.replace(/[^\w. -]+/g, '_')}.${job.ext}`
      }
    }
  }
}

function createDemoClient(): ApiClient {
  return {
    mode: 'demo',
    label: 'demo backend (no service connected)',
    health: async () => ({ ok: true, version: 'demo' }),
    analyze: async (url) => {
      await delay(650)
      if (!url.includes('.')) throw new ApiError('That link does not look valid.')
      return {
        id: `demo-${Date.now()}`,
        url,
        title: titleFromUrl(url),
        uploader: 'Demo channel (sample data)',
        durationSec: 754,
        extractor: 'demo',
        formats: DEMO_FORMATS,
      }
    },
    listJobs: async () => {
      tickDemo()
      return demo.jobs.map((job) => ({ ...job }))
    },
    createDownload: async ({ url, formatId }) => {
      const format = DEMO_FORMATS.find((f) => f.id === formatId) ?? DEMO_FORMATS[0]
      const job: DownloadJob = {
        id: `job-${++demo.seq}`,
        url,
        title: titleFromUrl(url),
        formatId: format.id,
        formatLabel: format.label,
        ext: format.ext,
        status: 'downloading',
        receivedBytes: 0,
        totalBytes: format.filesizeBytes,
        speedBps: 8_000_000,
        createdAt: Date.now(),
      }
      tickDemo()
      demo.jobs.unshift(job)
      return { ...job }
    },
    cancelJob: async (id) => {
      const job = demo.jobs.find((j) => j.id === id)
      if (job && job.status !== 'complete') job.status = 'canceled'
    },
    removeJob: async (id) => {
      demo.jobs = demo.jobs.filter((j) => j.id !== id)
    },
    clearFinished: async () => {
      demo.jobs = demo.jobs.filter(
        (j) => j.status !== 'complete' && j.status !== 'error' && j.status !== 'canceled',
      )
    },
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Pick a backend: use the real service when it answers /health, otherwise fall
 * back to the demo backend so the UI is still usable. Set VITE_DEMO=true to
 * skip the probe entirely.
 */
export async function connect(): Promise<ApiClient> {
  if (FORCE_DEMO) return createDemoClient()
  const live = createLiveClient()
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ApiError('timeout')), 2500),
    )
    const health = await Promise.race([live.health(), timeout])
    if (health.ok) return live
  } catch {
    /* fall through to demo */
  }
  return createDemoClient()
}

export { ApiError }
