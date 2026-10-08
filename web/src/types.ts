/**
 * Shared types for the Video Downloader UI.
 *
 * These describe the contract the UI expects from the downloader backend
 * (see src/api.ts for the exact HTTP shape).
 */

export type MediaKind = 'video' | 'audio'

/** A single downloadable rendition of a video. */
export interface Format {
  id: string
  /** Human readable label, e.g. "1080p MP4" or "Audio only (m4a)". */
  label: string
  ext: string
  kind: MediaKind
  height?: number
  fps?: number
  vcodec?: string
  acodec?: string
  bitrateKbps?: number
  filesizeBytes?: number
}

/** Metadata returned by POST /api/analyze. */
export interface VideoInfo {
  id: string
  url: string
  title: string
  uploader?: string
  durationSec?: number
  thumbnailUrl?: string
  extractor: string
  formats: Format[]
}

export type JobStatus =
  | 'queued'
  | 'downloading'
  | 'converting'
  | 'complete'
  | 'error'
  | 'canceled'

export const ACTIVE_STATUSES: readonly JobStatus[] = ['queued', 'downloading', 'converting']

export interface DownloadJob {
  id: string
  url: string
  title: string
  thumbnailUrl?: string
  formatId: string
  formatLabel: string
  ext: string
  status: JobStatus
  receivedBytes: number
  totalBytes?: number
  speedBps?: number
  etaSec?: number
  error?: string
  filePath?: string
  createdAt: number
  completedAt?: number
}

export interface NewDownloadRequest {
  url: string
  formatId: string
}

export interface HealthResponse {
  ok: boolean
  version?: string
}

/** Bottom navigation destinations. */
export type Tab = 'home' | 'downloads' | 'downloaded' | 'settings'

/** Browser tab in multi-tab browsing (Q010, Q016). */
export interface BrowserTab {
  id: string
  url: string
  title?: string
}

/** 3-way theme preference (Q043). */
export type Theme = 'system' | 'dark' | 'light'
