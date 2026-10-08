# Video Downloader — v1 Consolidated Spec

**Status:** PROPOSED — pending user review. Approval formally ends the discovery freeze (Q091/Q076) and authorizes implementation.
**Source of truth:** `docs/discovery/qna-ledger.md` (Q001–Q100, all answered; this doc is a synthesis — the ledger wins on any conflict).
**Date:** 2026-10-08 · **Target device:** user's iPad, iOS 16+, sideloaded

---

## 1. Product identity

- **Name:** Video Downloader · **Branding:** keep existing purple mark (Q030)
- **Soul (Q092b):** honors the legacy free YouTube-download apps — boot a site, grab the video, keep it in a library, build playlists, *play the music video*. Audio-first polish is a v2+ priority, not an afterthought. Audio-only downloads (Q023) and background audio (Q053) are the v1 foundation of that loop.
- **Posture:** personal, single-user, private, on-device. No accounts, no cloud, no telemetry (Q001/Q002/Q075).

## 2. Scope

### In v1
On-device VidMate-style browser-shell · multi-tab browsing · universal site detection (any site with videos, Q003) · JS extractor + native HLS/mp4 engine · MP4 + HLS + audio-only · ffmpeg stream-copy mux · background/resume transfers · unlimited parallel · private in-app storage · in-app player (video + audio, PiP, background audio) · share-sheet export · Settings (theme/versions/clear-data/Export All) · WKContentRuleList ad-blocker · hot-fix channel · notifications on completion · light+dark themes · free-space guard.

### Never-list (forever out — Q075, Q082, Q088)
No accounts · no cloud sync/storage · no Android / no iPhone-first · no desktop app · no social/marketplace features · no monetization · **no captcha/age-gate/anti-bot bypasses** · **no DRM decryption** (FairPlay/Widevine/PlayReady).

### Back-pocket (deferred, ranked — Q074)
1. Batch/playlist downloads *(also the music-player spine — Q092b)*
2. Visited-most history
3. iPhone responsive pass
4. Cheap cosmetics batch (log console in Settings, editing tiles, auto-download toggle, Dynamic Type…)
- Named v3 seeds: **immersive multi-view** (vertical detection, 2–3 side-by-side landscape, hands-free queue, playlist stacking — Q092a/Q095) · **music-player mode** (audio-first UI, artwork/metadata, playlist-centric library — Q092b)
- Full list: ledger `## Back-pocket`.

## 3. Architecture

- **All on-device** — no PC server, no cloud, no yt-dlp REST (Q001/Q009). Demo mode must not ship enabled (Q009).
- **Shell:** Theos-built native iOS app (iPad-only, iOS 16+, Q027). Two-layer browser: browsing `WKWebView` sits *under* transparent native chrome (VidMate-style). Never external tabs/redirects.
- **Bridge:** `WKScriptMessageHandler` named `vd`. Web→shell: `requestNavigation`. Shell→web envelope `{source:'vd-native', type:'detect', tabId, sources[]}` — detections are **per-tab** (Q046); the pill/sheet reflect the active tab only.
- **Web UI:** Vite/React shipped as local bundle resources. `ApiClient` contract reimplemented by `LocalEngine` (Q015). DeepSeek owns `web/src/`; decisions table in the ledger is the canonical handoff (Q072).
- **Detection rules:** continuous DOM-mutation re-arm (pill appears when the video element mounts, even after consent banners — Q087) · dedupe by page URL preferred, else master manifest, never segments (Q006) · **replace-on-change with recency ordering** — quality switches and ad→content transitions supersede stale entries (Q089) · feeds/Shorts need no special-casing (Q095).

## 4. Engine

- **Routing by sniff kind (Q047):**
  - `page` → JS extractor in the web UI (ytdl-core class) (Q011)
  - `hls` → native manifest parse; variants shown as formats, **cap 8, height-descending, deduped by resolution**, plus separate audio row (Q047/Q096)
  - `video` (direct mp4) → single-entry sheet
- **Transfers:** native `URLSession` (Q013) · HTTP Range resume day one (Q019) · background sessions (Q020) · **unlimited parallel** (Q018) · **Referer = pageURL + Safari UA forwarded on every transfer** (Q059).
- **ffmpeg:** LGPL build, **stream-copy only** (no re-encode), ~60 MB ipa (Q021).
- **Audio-only formats: v1** (Q023). Playlists/batch: not v1 (Q024).
- **Free-space guard:** native check before start; blocking warn under **1 GB free**, with Download-Anyway override (Q090).
- **Errors:** friendly one-liner + expandable technical details (status, stage, URL) (Q057).
- **Hot-fix channel (Track A):** private repo `video-downloader-extractors`, `main` only, `payload/` + `manifest.json` (version + sha256 per file) (Q017/Q099). Pinned HTTPS fetch at launch; bundled fallback; **hot-fix JS runs only in a sandboxed, cookie-less webview — never the logged-in browsing webview** (Q060).
- **Ad-blocker:** bundled `WKContentRuleList` blocking ad networks/popups/trap buttons; **whitelist `youtube.com` / `ytimg.com` / `googlevideo.com`**; rule JSON hot-updatable via Track A; blocks requests only — never bypasses protections (Q086, amended).
- **Fences:** manual dismissal of consent/age-gate/interstitials only — never automate bypasses (Q082) · DRM pages produce no output, optionally "protected stream" status later (Q088).

## 5. UX

- **Start page:** brand + search bar + four tiles — YouTube, TikTok, Instagram, X (Q008/Q038). Bare domains/free text → YouTube results (`normalizeUrl`/`toNavigationTarget`).
- **Tabs:** cap 10; horizontal strip + "+"; swipe-to-close + long-press close/refresh; no overview grid (Q016/Q058). Persist tab URLs across launches (Q016).
- **App-tab switch (Home↔Downloads↔Downloaded):** suspend-and-freeze browsing WebView (pause media via injected JS), restore on return — no reload (Q039).
- **Logins:** allowed in the shell browser; cookies persist (Q028/Q084). No history, no bookmarks v1 (Q052).
- **Pill:** per-active-tab detection state (scanning / ready / error); never carries download-progress meaning (Q051). Multiple sources on one page → sheet opens a **source picker with thumbnails first**, then formats for the chosen source (Q033 v1); rich grouping UI = v2 back-pocket.
- **Sheet:** bottom sheet, drag-dismissible; format list + audio row; HLS entries labeled by resolution.
- **Settings screen (v1 contents — Q034/Q043/Q055/Q070):** three-way theme (System default / Dark / Light) · app version + extractor version (read-only, tap-to-copy) · Clear browsing data (cookies + cache) · Export All.
- **Library (Downloaded):** newest-first (Q098) · storage header "X GB in N files" (Q044) · per-row: play / share (system share sheet) / delete-with-confirm (Q014/Q041/Q042/Q045) · metadata persisted (localStorage) + native existence sweep on launch (Q029).
- **Clipboard:** auto-read on foreground when content is URL-like (Q026).
- **Notifications:** pre-prompt sheet → system dialog at first queued background download; "Download complete: <title>" (Q079).
- **Orientation/multitasking:** both orientations, landscape tuned (Q036); Split View/Slide Over supported (Q097).
- **A11y:** labels/hints on all controls + `prefers-reduced-motion`; Dynamic Type deferred (Q068).
- **Onboarding:** none; empty states teach (Q048).

## 6. Storage

- **Fully private container** (`Library/`) — no Files-app visibility, no `UIFileSharingEnabled`, no Photos/Downloads integration (Q031-B, Q022).
- **Filenames:** `Title - 1080p.mp4`; auto-suffix on collision (Q014).
- **Deletion:** confirm alert; irreversible (Q045).
- **Escape hatch:** per-row share sheet + Settings Export All (Q042/Q070). iCloud auto-mirror: never for now (back-pocket at most).
- **Re-sideload survival:** assume container + localStorage survive (same bundle ID + signing identity); **verify on first weekly re-sign** — week-1 acceptance addendum (Q069).

## 7. Playback

- Native full-screen `AVPlayer` (video) + dedicated audio screen (Q041). Library files only.
- Background audio enabled (`UIBackgroundModes = audio` + AVAudioSession) (Q053).
- Picture-in-Picture on (Q054).
- Subtitles: legible-track passthrough only (player's native menu); sidecar .srt/.vtt deferred (Q056).

## 8. iOS configuration

- `NSAllowsArbitraryLoads = true` (Q049).
- Cellular guard: `NWPathMonitor`, "Waiting for Wi-Fi" state; dormant on Wi-Fi-only iPads (Q035/Q081 — device model never stated; guard ships either way).
- Notification permission per §5 (Q079).
- Debug: Console.app over USB v1; in-app log console = back-pocket (Q066 amendment).

## 9. Build & operations

- **Monorepo:** `web/` (DeepSeek's project, moved) + `ios/` (Theos shell) + `tools/` (build scripts, ignored installers) (Q064).
- **Freeze-and-restructure (Q100):** first post-approval commit moves the tree, adds `ios/` skeleton + `.gitignore` denylist (`*.ipa`, `*.p12`, `*.mobileprovision`, `tools/*.exe`) (Q071); DeepSeek gets updated paths in the handoff note.
- **Branching:** main + short-lived `ios/*` branches only (Q073).
- **Build:** scripted `tools/build.sh` — web build → copy `dist/` into bundle → `make package` → re-sign (Q061). Requires WSL Ubuntu + Theos (install paused by user; resumes post-approval).
- **Signing:** free Apple ID + Sideloadly, weekly cable re-sign (Q062/Q063). Semver tag every sideloaded build; Settings version reads the tag (Q065).
- **Two-track release (Q080):** Track A = hot-fix JS/rules, live at next app launch, no sideload · Track B = native/shell/UI, via build.sh + (weekly or ad-hoc) re-sign.
- **Maintenance:** user is maintainer; I prepare patches on request; pushes always via explicit user go (Q077). Weekly 30-second detection check folded into the re-sign ritual (Q067).

## 10. Definition of done (v1)

Acceptance script (Q040 + Q050 amendments) on the iPad:
1. Launch → tiles visible → tap YouTube tile → loads in-app, no redirect.
2. Open a video → pill fades in → tap pill → sheet shows formats.
3. Download 720p MP4 + audio-only → both complete in background (app closed mid-transfer) → resume/finish.
4. Downloaded tab lists both after restart → **play both in-app (full-screen video + audio screen)**.
5. Back/reload/tabs work; copied-link detection fires once.
6. **AirDrop one export via share sheet.**
7. **Theme Dark→Light→System restyles everything (incl. pill/sheet).**
8. **Kill + relaunch: tabs and library persist.**
9. **Week-1 addendum: first weekly re-sign preserves library + tabs (Q069).**

Plus: **1-week soak** — `docs/soak-log.md`, one line per observation, day-7 triage into fix / back-pocket / never (Q094).

## 11. Post-v1 roadmap

- **v2:** batch/playlist downloads *(music-player spine — Q092b)* → visited-most history → iPhone pass → cosmetics batch (Q074).
- **v3 seeds:** immersive multi-view (Q092a/Q095) · full music-player mode (Q092b). Both respect the never-list.

## 12. Process

- Ledger is canonical; this spec is the synthesis handed to builders (Q072).
- Approval of this doc = **discovery concluded**, freeze lifted, implementation authorized (Q091/Q076).
- First three implementation moves: (1) monorepo restructure commit, (2) WSL Ubuntu + Theos install, (3) `ios/` shell skeleton (two-WKWebView + bridge + empty `tools/build.sh`).
