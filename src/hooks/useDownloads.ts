import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiClient, ApiMode } from '../api'
import type { DownloadJob, NewDownloadRequest } from '../types'

const POLL_MS = 1000

export interface DownloadsController {
  jobs: DownloadJob[]
  active: DownloadJob[]
  finished: DownloadJob[]
  error: string | null
  start: (request: NewDownloadRequest) => Promise<void>
  cancel: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  clearFinished: () => Promise<void>
}

/**
 * Keeps the job list in sync with the backend by polling. Polling keeps the
 * contract trivial (plain JSON GET) and behaves the same in demo mode.
 */
export function useDownloads(api: ApiClient | null, mode: ApiMode | 'connecting'): DownloadsController {
  const [jobs, setJobs] = useState<DownloadJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!api || inFlight.current) return
    inFlight.current = true
    try {
      setJobs(await api.listJobs())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load downloads')
    } finally {
      inFlight.current = false
    }
  }, [api])

  // An empty dependency list here would miss the switch from demo to live.
  useEffect(() => {
    if (!api) return
    // Deferred by a tick: the first read lands after mount rather than during
    // it, so no state update happens synchronously inside this effect.
    const initial = setTimeout(() => void refresh(), 0)
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [api, mode, refresh])

  const start = useCallback(
    async (request: NewDownloadRequest) => {
      if (!api) return
      await api.createDownload(request)
      await refresh()
    },
    [api, refresh],
  )

  const cancel = useCallback(
    async (id: string) => {
      if (!api) return
      await api.cancelJob(id)
      await refresh()
    },
    [api, refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!api) return
      await api.removeJob(id)
      await refresh()
    },
    [api, refresh],
  )

  const clearFinished = useCallback(async () => {
    if (!api) return
    await api.clearFinished()
    await refresh()
  }, [api, refresh])

  const isActive = (job: DownloadJob) =>
    job.status === 'queued' || job.status === 'downloading' || job.status === 'converting'

  return {
    jobs,
    active: jobs.filter(isActive),
    finished: jobs.filter((job) => !isActive(job)),
    error,
    start,
    cancel,
    remove,
    clearFinished,
  }
}
