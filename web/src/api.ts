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

export interface StorageSnapshot {
  /** Free bytes reported by the native container (null when unknown/demo). */
  freeBytes: number | null
}

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
  pauseJob(id: string): Promise<void>
  resumeJob(id: string): Promise<void>
  retryJob(id: string): Promise<void>
  /** Patch web-only fields (playedAt, playbackProgress, waitingForWifi, …). */
  updateJob(id: string, patch: Partial<DownloadJob>): Promise<void>
  /** Ask the shell for free space + on-disk files (D018, D038). */
  requestStorageInfo(): Promise<void>
  /** Subscribe to storage snapshots. Returns unsubscribe. */
  onStorage(handler: (snapshot: StorageSnapshot) => void): () => void
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
  private simTimers = new Map<string, ReturnType<typeof setInterval>>()
  private storageHandlers = new Set<(snapshot: StorageSnapshot) => void>()
  private freeBytes: number | null = null

  constructor() {
    this.jobs = readStoredJobs()
    // Listen to native download progress events from the shell
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        const data = event.data
        if (data && data.source === 'vd-native' && data.type === 'download-progress') {
          const { id, receivedBytes, totalBytes, speedBps, status, filePath, error, stage } =
            data.payload || {}
          const job = this.jobs.find((j) => j.id === id)
          if (job) {
            if (receivedBytes !== undefined) job.receivedBytes = receivedBytes
            if (totalBytes !== undefined) job.totalBytes = totalBytes
            if (speedBps !== undefined) job.speedBps = speedBps
            if (stage !== undefined) job.stage = stage
            if (filePath !== undefined) job.filePath = filePath
            if (status) job.status = status
            if (status === 'complete') job.completedAt = Date.now()
            if (status === 'error') {
              job.error = error || job.error || 'Download failed'
              job.speedBps = undefined
            }
            writeStoredJobs(this.jobs)
          }
        } else if (data && data.source === 'vd-native' && data.type === 'storage-info') {
          const { freeBytes, files } = data.payload || {}
          if (typeof freeBytes === 'number') {
            this.freeBytes = freeBytes
            this.emitStorage()
          }
          if (Array.isArray(files)) {
            this.sweepFilePresence(files as { name: string }[])
          }
        }
      })
    }
  }

  /** D038: mark complete jobs whose file vanished from the native container. */
  private sweepFilePresence(files: { name: string }[]) {
    const names = new Set(files.map((f) => f.name))
    let changed = false
    for (const job of this.jobs) {
      if (job.status !== 'complete') continue
      const present =
        names.has(`${job.id}.${job.ext}`) || names.has(`${job.id}.mp4`) || names.has(`${job.id}.m4a`)
      const missing = !present
      if (job.fileMissing !== missing) {
        job.fileMissing = missing
        changed = true
      }
    }
    if (changed) writeStoredJobs(this.jobs)
  }

  private emitStorage() {
    for (const handler of this.storageHandlers) {
      handler({ freeBytes: this.freeBytes })
    }
  }

  onStorage(handler: (snapshot: StorageSnapshot) => void): () => void {
    this.storageHandlers.add(handler)
    if (this.freeBytes !== null) handler({ freeBytes: this.freeBytes })
    return () => this.storageHandlers.delete(handler)
  }

  async requestStorageInfo(): Promise<void> {
    if (hasNativeShell()) {
      sendNativeAction('storageInfo')
      return
    }
    // Demo/standalone: approximate with the origin quota.
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const { quota, usage } = await navigator.storage.estimate()
        this.freeBytes = quota && usage ? Math.max(0, quota - usage) : null
        this.emitStorage()
      }
    } catch {
      /* estimate unavailable */
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
      title: request.title || titleFromUrl(request.url),
      thumbnailUrl: request.thumbnailUrl,
      formatId: format.id,
      formatLabel: format.label,
      ext: format.ext,
      status: 'downloading',
      receivedBytes: 0,
      totalBytes: format.filesizeBytes,
      speedBps: 8_500_000,
      durationSec: request.durationSec,
      isPrivate: request.private,
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
        isPrivate: !!request.private,
      })
    } else {
      // Standalone browser simulation tick
      this.simulateProgress(job.id)
    }

    return { ...job }
  }

  private simulateProgress(id: string) {
    if (this.simTimers.has(id)) return
    const timer = setInterval(() => {
      const currentJob = this.jobs.find((j) => j.id === id)
      if (!currentJob || currentJob.status !== 'downloading') {
        clearInterval(timer)
        this.simTimers.delete(id)
        return
      }

      const total = currentJob.totalBytes ?? 80_000_000
      currentJob.receivedBytes = Math.min(total, currentJob.receivedBytes + total / 10)
      if (currentJob.receivedBytes >= total) {
        currentJob.receivedBytes = total
        currentJob.status = 'complete'
        currentJob.completedAt = Date.now()
        currentJob.speedBps = undefined
        clearInterval(timer)
        this.simTimers.delete(id)
      }
      writeStoredJobs(this.jobs)
    }, 400)
    this.simTimers.set(id, timer)
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

  async pauseJob(id: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === id)
    if (job && (job.status === 'downloading' || job.status === 'queued')) {
      job.status = 'paused'
      job.speedBps = undefined
      writeStoredJobs(this.jobs)
      if (hasNativeShell()) {
        sendNativeAction('pauseDownload', { id })
      }
    }
  }

  async resumeJob(id: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === id)
    if (job && job.status === 'paused') {
      job.status = 'downloading'
      job.error = undefined
      writeStoredJobs(this.jobs)
      if (hasNativeShell()) {
        sendNativeAction('resumeDownload', { id, receivedBytes: job.receivedBytes })
      } else {
        this.simulateProgress(id)
      }
    }
  }

  async retryJob(id: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === id)
    if (job && (job.status === 'error' || job.status === 'canceled')) {
      // D006: resume from byte offset when possible, else restart.
      job.status = 'downloading'
      job.error = undefined
      job.speedBps = 8_500_000
      writeStoredJobs(this.jobs)
      if (hasNativeShell()) {
        sendNativeAction('startDownload', {
          id,
          url: job.url,
          ext: job.ext,
          title: job.title,
          isAudio: job.formatId.startsWith('a-'),
          receivedBytes: job.receivedBytes,
        })
      } else {
        this.simulateProgress(id)
      }
    }
  }

  async updateJob(id: string, patch: Partial<DownloadJob>): Promise<void> {
    const job = this.jobs.find((j) => j.id === id)
    if (!job) return
    Object.assign(job, patch)
    writeStoredJobs(this.jobs)
    if (patch.waitingForWifi !== undefined && hasNativeShell()) {
      sendNativeAction('useCellular', { id })
    }
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
