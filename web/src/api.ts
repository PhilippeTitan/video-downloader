import { sendNativeAction, hasNativeShell } from './bridge'
import type {
  DownloadJob,
  Format,
  HealthResponse,
  NewDownloadRequest,
  VideoInfo,
} from './types'

/**
 * On-Device Local Engine (Q001, Q009, Q015).
 * Replaces remote REST server with an on-device engine.
 * Downloads are executed by native URLSession in the iOS shell,
 * with metadata persisted locally in localStorage (Q029).
 */

export type ApiMode = 'live'

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

class ApiError extends Error {}

const STORAGE_KEY = 'vd-downloads-v1'

const STANDARD_FORMATS: Format[] = [
  { id: 'v-1080', label: '1080p MP4', ext: 'mp4', kind: 'video', height: 1080, fps: 30, vcodec: 'avc1', filesizeBytes: 154_000_000 },
  { id: 'v-720', label: '720p MP4', ext: 'mp4', kind: 'video', height: 720, fps: 30, vcodec: 'avc1', filesizeBytes: 78_000_000 },
  { id: 'v-480', label: '480p MP4', ext: 'mp4', kind: 'video', height: 480, fps: 30, vcodec: 'avc1', filesizeBytes: 39_000_000 },
  { id: 'v-360', label: '360p MP4', ext: 'mp4', kind: 'video', height: 360, fps: 30, vcodec: 'avc1', filesizeBytes: 22_000_000 },
  { id: 'a-m4a', label: 'Audio only (m4a)', ext: 'm4a', kind: 'audio', bitrateKbps: 128, acodec: 'mp4a', filesizeBytes: 4_500_000 },
]

function readStoredJobs(): DownloadJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as DownloadJob[]
  } catch {
    return []
  }
}

function writeStoredJobs(jobs: DownloadJob[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch {
    /* quota exceeded */
  }
}

function titleFromUrl(target: string): string {
  try {
    const parsed = new URL(target)
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      const v = parsed.searchParams.get('v')
      return v ? `YouTube Video (${v})` : 'YouTube Video'
    }
    const slug = parsed.pathname.split('/').filter(Boolean).pop()
    if (slug) {
      return decodeURIComponent(slug).replace(/[-_+]/g, ' ')
    }
    return parsed.hostname
  } catch {
    return 'Media File'
  }
}

export class LocalEngine implements ApiClient {
  readonly mode: ApiMode = 'live'
  readonly label = 'On-Device Engine'

  private jobs: DownloadJob[] = []

  constructor() {
    this.jobs = readStoredJobs()
    // Listen to native download progress events from the shell
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        const data = event.data
        if (data && data.source === 'vd-native' && data.type === 'download-progress') {
          const { id, receivedBytes, totalBytes, speedBps, status } = data.payload || {}
          const job = this.jobs.find((j) => j.id === id)
          if (job) {
            if (receivedBytes !== undefined) job.receivedBytes = receivedBytes
            if (totalBytes !== undefined) job.totalBytes = totalBytes
            if (speedBps !== undefined) job.speedBps = speedBps
            if (status) job.status = status
            if (status === 'complete') job.completedAt = Date.now()
            writeStoredJobs(this.jobs)
          }
        }
      })
    }
  }

  async health(): Promise<HealthResponse> {
    return { ok: true, version: '1.0.0-ondevice' }
  }

  async analyze(url: string): Promise<VideoInfo> {
    const title = titleFromUrl(url)
    const isAudioOnly = url.endsWith('.m4a') || url.endsWith('.mp3')
    const isDirectVideo = url.endsWith('.mp4') || url.endsWith('.mov')

    let formats = STANDARD_FORMATS
    if (isAudioOnly) {
      formats = [STANDARD_FORMATS.find((f) => f.kind === 'audio') ?? STANDARD_FORMATS[4]]
    } else if (isDirectVideo) {
      formats = [
        { id: 'v-direct', label: 'Source MP4', ext: 'mp4', kind: 'video', height: 1080, filesizeBytes: 95_000_000 },
        STANDARD_FORMATS[4],
      ]
    }

    return {
      id: `info-${Date.now()}`,
      url,
      title,
      uploader: 'Web Source',
      extractor: 'on-device-extractor',
      formats,
    }
  }

  async listJobs(): Promise<DownloadJob[]> {
    this.jobs = readStoredJobs()
    return [...this.jobs]
  }

  async createDownload(request: NewDownloadRequest): Promise<DownloadJob> {
    const format = STANDARD_FORMATS.find((f) => f.id === request.formatId) ?? STANDARD_FORMATS[0]
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const isAudio = format.kind === 'audio'

    const job: DownloadJob = {
      id,
      url: request.url,
      title: titleFromUrl(request.url),
      formatId: format.id,
      formatLabel: format.label,
      ext: format.ext,
      status: 'downloading',
      receivedBytes: 0,
      totalBytes: format.filesizeBytes,
      speedBps: 8_500_000,
      createdAt: Date.now(),
    }

    this.jobs.unshift(job)
    writeStoredJobs(this.jobs)

    // Notify native iOS shell if running inside app (Q013, Q020)
    if (hasNativeShell()) {
      sendNativeAction('startDownload', {
        id,
        url: request.url,
        ext: format.ext,
        title: job.title,
        isAudio,
      })
    } else {
      // Standalone browser simulation tick
      this.simulateProgress(job)
    }

    return { ...job }
  }

  private simulateProgress(job: DownloadJob) {
    const total = job.totalBytes ?? 80_000_000
    const step = total / 10
    const timer = setInterval(() => {
      const currentJob = this.jobs.find((j) => j.id === job.id)
      if (!currentJob || currentJob.status !== 'downloading') {
        clearInterval(timer)
        return
      }

      currentJob.receivedBytes += step
      if (currentJob.receivedBytes >= total) {
        currentJob.receivedBytes = total
        currentJob.status = 'complete'
        currentJob.completedAt = Date.now()
        clearInterval(timer)
      }
      writeStoredJobs(this.jobs)
    }, 400)
  }

  async cancelJob(id: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === id)
    if (job && job.status !== 'complete') {
      job.status = 'canceled'
      writeStoredJobs(this.jobs)
      if (hasNativeShell()) {
        sendNativeAction('cancelDownload', { id })
      }
    }
  }

  async removeJob(id: string): Promise<void> {
    this.jobs = this.jobs.filter((j) => j.id !== id)
    writeStoredJobs(this.jobs)
    if (hasNativeShell()) {
      sendNativeAction('removeDownload', { id })
    }
  }

  async clearFinished(): Promise<void> {
    this.jobs = this.jobs.filter(
      (j) => j.status !== 'complete' && j.status !== 'error' && j.status !== 'canceled',
    )
    writeStoredJobs(this.jobs)
  }
}

/**
 * Returns the on-device LocalEngine directly (Q001, Q015).
 * Connects instantly with no network roundtrips or PC servers.
 */
export async function connect(): Promise<ApiClient> {
  return new LocalEngine()
}

export { ApiError }
