import type { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'

export interface SearchResult {
  id: string
  title: string
  duration?: string
  thumbnail: string
  channel?: string
  url: string
}

export async function searchVideos(query: string): Promise<SearchResult[]> {
  const cleanQ = query.trim() || 'trending'

  // Live YouTube search scraping
  try {
    const encoded = encodeURIComponent(cleanQ)
    const res = await fetch(`https://www.youtube.com/results?search_query=${encoded}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    const html = await res.text()
    const startIdx = html.indexOf('ytInitialData = ')
    if (startIdx !== -1) {
      const jsonStart = startIdx + 'ytInitialData = '.length
      const endIdx = html.indexOf(';</script>', jsonStart)
      if (endIdx !== -1) {
        const data = JSON.parse(html.slice(jsonStart, endIdx))
        const sectionList =
          data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || []
        const items: SearchResult[] = []
        for (const section of sectionList) {
          const contents = section.itemSectionRenderer?.contents || []
          for (const item of contents) {
            if (item.videoRenderer) {
              const vr = item.videoRenderer
              const id = vr.videoId
              const title =
                vr.title?.runs?.[0]?.text ||
                vr.title?.accessibility?.accessibilityData?.label ||
                'Video'
              const duration = vr.lengthText?.simpleText || ''
              const thumbnail =
                vr.thumbnail?.thumbnails?.[vr.thumbnail.thumbnails.length - 1]?.url ||
                `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
              const channel =
                vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'YouTube Creator'
              items.push({
                id,
                title,
                duration,
                thumbnail,
                channel,
                url: `https://www.youtube.com/watch?v=${id}`,
              })
            }
          }
        }
        if (items.length > 0) {
          return items.slice(0, 24)
        }
      }
    }
  } catch (err) {
    console.warn('[server] Live YouTube search error:', err)
  }

  // Fallback: Internet Archive public library
  try {
    const encoded = encodeURIComponent(cleanQ)
    const archiveRes = await fetch(
      `https://archive.org/advancedsearch.php?q=(${encoded}+OR+title:${encoded})+AND+mediatype:movies&fl[]=identifier,title,description,creator,runtime&sort[]=downloads+desc&rows=16&output=json`
    )
    if (archiveRes.ok) {
      const data = (await archiveRes.json()) as any
      const docs = data?.response?.docs || []
      const items: SearchResult[] = docs
        .filter((d: any) => d.identifier && d.title)
        .map((doc: any) => ({
          id: doc.identifier,
          title: doc.title,
          duration: doc.runtime || '',
          thumbnail: `https://archive.org/services/img/${doc.identifier}`,
          channel: doc.creator || 'Archive Movies',
          url: `https://archive.org/download/${doc.identifier}/${doc.identifier}.mp4`,
        }))
      if (items.length > 0) return items
    }
  } catch (err) {
    console.warn('[server] Archive.org search fallback error:', err)
  }

  return []
}

export async function analyzeVideoUrl(url: string) {
  let title = 'Detected Media Video'
  let thumbnail = ''
  let durationSec = 0
  let isAudio = false

  try {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
      if (oembedRes.ok) {
        const data = (await oembedRes.json()) as any
        if (data?.title) title = data.title
        if (data?.thumbnail_url) thumbnail = data.thumbnail_url
      }
      const vidMatch = url.match(/(?:v=|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
      if (vidMatch && !thumbnail) {
        thumbnail = `https://i.ytimg.com/vi/${vidMatch[1]}/hqdefault.jpg`
      }
    } else if (url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.webm')) {
      const fileName = url.split('/').pop()?.split('?')[0] || 'Media Video'
      title = decodeURIComponent(fileName).replace(/[-_+]/g, ' ')
    } else if (url.endsWith('.m4a') || url.endsWith('.mp3')) {
      isAudio = true
      const fileName = url.split('/').pop()?.split('?')[0] || 'Audio Track'
      title = decodeURIComponent(fileName).replace(/[-_+]/g, ' ')
    }
  } catch (err) {
    console.warn('[server] Error analyzing URL:', err)
  }

  const formats = isAudio
    ? [
        { id: 'a-m4a', label: 'Audio only (m4a)', ext: 'm4a', kind: 'audio', bitrateKbps: 256, filesizeBytes: 8_500_000 },
        { id: 'a-mp3', label: 'MP3 High Quality', ext: 'mp3', kind: 'audio', bitrateKbps: 320, filesizeBytes: 11_200_000 },
      ]
    : [
        { id: 'v-1080', label: '1080p Full HD MP4', ext: 'mp4', kind: 'video', height: 1080, fps: 60, filesizeBytes: 185_000_000 },
        { id: 'v-720', label: '720p HD MP4', ext: 'mp4', kind: 'video', height: 720, fps: 30, filesizeBytes: 84_000_000 },
        { id: 'v-480', label: '480p SD MP4', ext: 'mp4', kind: 'video', height: 480, fps: 30, filesizeBytes: 39_000_000 },
        { id: 'a-m4a', label: 'Audio only (m4a)', ext: 'm4a', kind: 'audio', bitrateKbps: 128, filesizeBytes: 6_800_000 },
      ]

  return {
    url,
    title,
    thumbnail,
    durationSec,
    formats,
  }
}

export function handleApiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = parsedUrl.pathname

  if (pathname === '/api/search') {
    const q = parsedUrl.searchParams.get('q') || ''
    searchVideos(q).then((results) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(JSON.stringify({ query: q, results }))
    }).catch((err) => {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    })
    return
  }

  if (pathname === '/api/analyze') {
    const url = parsedUrl.searchParams.get('url') || ''
    analyzeVideoUrl(url).then((info) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(JSON.stringify(info))
    }).catch((err) => {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    })
    return
  }

  if (pathname === '/api/webview-search') {
    const q = parsedUrl.searchParams.get('q') || 'trending'
    const isDirectVideo = /\.(mp4|mov|webm|m4v|m3u8)(\?|$)/i.test(q)

    if (isDirectVideo) {
      const html = generateDirectVideoPlayerHtml(q)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('X-Frame-Options', 'ALLOWALL')
      res.end(html)
      return
    }

    const ytMatch = q.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    if (ytMatch) {
      const vidId = ytMatch[1]
      // Direct clean official YouTube embed player
      const embedUrl = `https://www.youtube-nocookie.com/embed/${vidId}?autoplay=1&enablejsapi=1&playsinline=1`
      res.writeHead(302, { Location: embedUrl })
      res.end()
      return
    }

    searchVideos(q).then((results) => {
      const html = generateYouTubeSearchPageHtml(q, results)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('X-Frame-Options', 'ALLOWALL')
      res.end(html)
    }).catch((err) => {
      res.statusCode = 500
      res.end(`Error: ${String(err)}`)
    })
    return
  }

  next()
}

function generateDirectVideoPlayerHtml(videoUrl: string): string {
  const fileName = decodeURIComponent(videoUrl.split('/').pop()?.split('?')[0] || 'Media Video')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(fileName)}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <video src="${escapeHtml(videoUrl)}" controls autoplay playsinline></video>
  <script>
    window.parent.postMessage({
      source: 'vd-browser',
      type: 'detect',
      payload: { url: '${escapeHtml(videoUrl)}', kind: 'video', title: '${escapeHtml(fileName)}' }
    }, '*');
  </script>
</body>
</html>`
}

function generateYouTubeSearchPageHtml(query: string, results: SearchResult[]): string {
  const listItems = results.map((item) => `
    <div class="video-row" onclick="playVideo('${item.id}', '${escapeHtml(item.title)}', '${item.thumbnail}')">
      <div class="thumb-container">
        <img src="${item.thumbnail}" alt="" loading="lazy" />
        ${item.duration ? `<span class="duration-badge">${escapeHtml(item.duration)}</span>` : ''}
      </div>
      <div class="video-info">
        <div class="video-title">${escapeHtml(item.title)}</div>
        <div class="channel-name">${escapeHtml(item.channel || 'YouTube')}</div>
      </div>
    </div>
  `).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>YouTube - ${escapeHtml(query)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f0f0f;
      color: #f1f1f1;
      font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(15, 15, 15, 0.98);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      padding: 12px 16px;
      gap: 12px;
      border-bottom: 1px solid #272727;
    }
    .yt-icon {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #fff;
    }
    .search-bar {
      flex: 1;
      display: flex;
      background: #121212;
      border: 1px solid #303030;
      border-radius: 20px;
      overflow: hidden;
    }
    .search-bar input {
      flex: 1;
      background: transparent;
      border: none;
      padding: 8px 16px;
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    .search-bar button {
      background: #222;
      border: none;
      padding: 0 16px;
      color: #aaa;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .feed {
      max-width: 900px;
      margin: 0 auto;
      padding: 12px 16px 80px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .video-row {
      display: flex;
      gap: 14px;
      cursor: pointer;
      border-radius: 12px;
      padding: 8px;
      transition: background 0.15s ease;
    }
    .video-row:hover {
      background: #272727;
    }
    .thumb-container {
      position: relative;
      flex: 0 0 168px;
      width: 168px;
      height: 94px;
      border-radius: 8px;
      overflow: hidden;
      background: #202020;
    }
    .thumb-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .duration-badge {
      position: absolute;
      bottom: 4px;
      right: 4px;
      background: rgba(0,0,0,0.8);
      font-size: 11px;
      font-weight: 500;
      padding: 1px 4px;
      border-radius: 4px;
    }
    .video-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .video-title {
      font-size: 14px;
      font-weight: 500;
      line-height: 1.35;
      color: #f1f1f1;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .channel-name {
      font-size: 12px;
      color: #aaa;
    }
    #active-player {
      display: none;
      position: fixed;
      inset: 0;
      background: #000;
      z-index: 100;
      flex-direction: column;
    }
    #active-player iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .player-back-bar {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 101;
    }
    .player-back-bar button {
      background: rgba(0,0,0,0.7);
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .empty-state {
      padding: 40px;
      text-align: center;
      color: #888;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="yt-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#ff0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
      <span>YouTube</span>
    </div>
    <form class="search-bar" onsubmit="onSearch(event)">
      <input id="q-in" type="text" placeholder="Search YouTube" value="${escapeHtml(query)}" />
      <button type="submit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      </button>
    </form>
  </div>

  <div class="feed">
    ${listItems.length > 0 ? listItems : '<div class="empty-state">No videos found. Try another search.</div>'}
  </div>

  <div id="active-player">
    <div class="player-back-bar">
      <button onclick="closePlayer()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>Back to results</span>
      </button>
    </div>
    <iframe id="player-frame" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
  </div>

  <script>
    function playVideo(id, title, thumbnail) {
      var embedUrl = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&enablejsapi=1&playsinline=1';
      var videoPageUrl = 'https://www.youtube.com/watch?v=' + id;

      // Notify parent app of detected video so download pill appears
      window.parent.postMessage({
        source: 'vd-browser',
        type: 'detect',
        payload: {
          url: videoPageUrl,
          kind: 'video',
          title: title,
          thumbnail: thumbnail
        }
      }, '*');

      var modal = document.getElementById('active-player');
      var iframe = document.getElementById('player-frame');
      iframe.src = embedUrl;
      modal.style.display = 'flex';
    }

    function closePlayer() {
      var modal = document.getElementById('active-player');
      var iframe = document.getElementById('player-frame');
      iframe.src = '';
      modal.style.display = 'none';
    }

    function onSearch(e) {
      e.preventDefault();
      var q = document.getElementById('q-in').value.trim();
      if (!q) return;
      window.location.href = '/api/webview-search?q=' + encodeURIComponent(q);
      window.parent.postMessage({
        source: 'vd-browser',
        type: 'search-query',
        payload: { query: q }
      }, '*');
    }

    // Auto-detect first video if available
    if (${results.length > 0}) {
      setTimeout(function() {
        var first = ${JSON.stringify(results[0])};
        window.parent.postMessage({
          source: 'vd-browser',
          type: 'detect',
          payload: {
            url: first.url,
            kind: 'video',
            title: first.title,
            thumbnail: first.thumbnail
          }
        }, '*');
      }, 300);
    }
  </script>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
