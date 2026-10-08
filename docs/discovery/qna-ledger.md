# Product Discovery — QnA Ledger

> Protocol: `PRODUCT_DISCOVERY.md` · Target: **200 questions** · Cadence: checkpoint every **9** unique answers
> Phase 1 (warm-up): 3 questions/round · Phase 2 (deep): 10 questions/round

---

## Pre-settled decisions (dedup anchors — never re-ask)

| ID | Canonical Intent | Domain Tags | Status / Disposition | Decision Note |
|---|---|---|---|---|
| S001 | In-app browser = native shell (browsing WKWebView under chrome UI); never redirect/external tab | architecture, browser, shell | Settled | Two-WebView chrome-over-content; chosen over iframe (sites refuse framing) and UI-only mock. |
| S002 | Download pill (ring: scanning/ready/error) → bottom sheet with source data | ux, pill, sheet | Settled | Sheet rises to mid-screen; drag-down/backdrop/X dismiss; Download CTA lives in sheet. |
| S003 | Address bar flies up to browser-style top bar on navigation | ux, nav | Settled | Idle centered hero → active top bar; clearing bar resets to idle. |
| S004 | Address bar accepts bare domains + free text; free text → YouTube search | nav, search | Settled | `youtube.com` → https; `funny cats` → youtube results page. |
| S005 | Web UI ↔ shell message bridge (navigate out, detection in) | architecture, bridge | Settled | `src/bridge.ts`: `requestNavigation` (vd-ui→shell), `onDetection` (shell→vd-ui envelope). |
| S006 | Backend = REST service (analyze/downloads/1s polling) with demo fallback | backend, api | Settled (existing code) | `api.ts` contract fixed; *where the service runs* = Q001. |
| S007 | Distribution = sideloaded .ipa via Sideloadly, free Apple ID, 7-day expiry | distribution, platform | Settled (constraint) | No App Store path; iPad-only target. |

---

## Q&A

| ID | Canonical Intent | Domain Tags | Status / Disposition | Decision Note |
|---|---|---|---|---|
| Q001 | Where does the yt-dlp backend service run for real use? | backend, infrastructure | Answered (redirected) | Fully on-device app; no PC service, no cloud. Engine must run on the iPad itself. Supersedes REST-service premise. |
| Q002 | Who is the app for — personal only vs shared? | strategy, distribution | Answered | Personal use only. |
| Q003 | Day-one site/format scope for sniffing + analysis? | scope, browser, backend | Answered | Universal intent: any site with a video must be downloadable. Feasibility tiering recorded (direct/sniffed media + YouTube extractor vs site-specific). |
| Q004 | How do finished files travel from backend to the iPad? | pipeline, storage, ios | Answered | Files download and save locally on the iPad (app Documents; Files-app visible via UIFileSharingEnabled). |
| Q005 | Does the backend need auth (LAN token/pairing)? | security, backend | Superseded | No server exists (Q001) — nothing to authenticate against. |
| Q006 | Detection → auto-analyze policy + HLS variant dedupe | browser, sniff, backend | Answered | Shell dedupes (page URL preferred, else master manifest, never segments); UI auto-analyzes first source; pill tap opens sheet. "Backend" = on-device engine. |
| Q007 | Browser chrome needs back/forward/reload + history state | ux, shell, nav | Answered | Web-driven via bridge: shell pushes canGoBack/canGoForward/isLoading/url; top bar renders back + reload. |
| Q008 | What does the browser start page / homepage show? | ux, browser, onboarding | Answered | Brand + bar + row of site shortcut tiles (YouTube first). |
| Q009 | Service-down UX + does demo mode ship in the .ipa? | reliability, offline | Superseded | No PC service (Q001). Demo/fake mode should not ship by default. |
| Q010 | Multi-tab browsing vs single tab for v1 | scope, shell, ux | Answered (multi-tab) | Multi-tab is a v1 requirement (user explicitly chose over single-tab recommendation). |
| Q011 | Engine placement: JS extractor in web UI vs native code | architecture, engine | Answered | JS extractor (e.g. @distube/ytdl-core) bundled in web UI resolves formats/URLs; transfer stays native (Q013). |
| Q012 | Stream strategy: progressive MP4 only vs HLS + muxing | engine, pipeline, scope | Answered (full scope) | User requires MP4 + HLS + ffmpeg muxing in v1 (rejected progressive-only). ffmpeg ships in app; mux audio+video HLS to MP4 natively. |
| Q013 | Download transport: native URLSession via bridge vs web fetch | architecture, engine, ios | Answered | Native URLSession in shell, bridge messages start/cancel + progress events. |
| Q014 | File naming, duplicates, and storage cleanup policy | storage, ux | Answered | Sanitized `Title - 1080p.mp4`; duplicates auto-suffix ` (2)`; per-row in-app delete; never auto-delete. |
| Q015 | Keep api.ts interface as local-engine adapter? | architecture, code | Answered | LocalEngine class implements ApiClient; connect() returns it; REST client + demo mode retired. |
| Q016 | Tab model: persistence across restart + tab cap | shell, ux, scope | Answered | Persist tab URLs across restart, cap 10, strip above bottom nav. |
| Q017 | Extractor hot-fix strategy when YouTube breaks the engine | engine, reliability | Answered | Remote hot-fix (fetch latest extractor JS from own GitHub), bundled fallback copy; active version surfaced in UI. |
| Q018 | Concurrent downloads: parallel count / queue behavior | pipeline, ux | Answered (unlimited) | Unlimited parallel downloads; no artificial slots (user rejected 2-slot recommendation). |
| Q019 | Resume partial downloads after interruption | pipeline, reliability | Answered | HTTP Range resume from day one; auto-resume on reconnect. |
| Q020 | Backgrounding: downloads continue when app is closed | pipeline, ios | Answered | Background URLSessionConfiguration from day one; system continues transfers + posts its own completion notification. |
| Q021 | ffmpeg build flavor + .ipa size budget | engine, ios, scope | Answered | LGPL static build, stream-copy only; ~60MB .ipa expected. |
| Q022 | Save destination: Photos app vs Files/Documents vs both | storage, ux, ios | Answered (clarify pending) | NOT Photos, NOT system Downloads — files stay local to the app only. Pending: app-private container vs Documents visible in Files app → Q031. |
| Q023 | Audio-only downloads (m4a) in v1? | engine, scope, ux | Answered | Yes — audio section in format sheet; engine work minimal. |
| Q024 | Playlist/batch download support in v1? | scope, engine | Answered (deferred) | Back-pocket v2; single-video loop must prove itself first. |
| Q025 | Share-sheet extension ("Share to app") in v1? | ios, ux, scope | Answered (deferred) | Back-pocket v2; clipboard detection covers the habit in v1. |
| Q026 | Clipboard detection on app open (offer copied link)? | ux, ios | Answered | Yes — auto-read on foreground when clipboard looks like a URL; prefilled bar + lit pill, user confirms. |
| Q027 | Min iOS version + iPad-only vs iPhone universal | ios, scope | Answered | iOS 16 minimum, iPad-only for v1 (responsive CSS kept for cheap iPhone v2). |
| Q028 | Login/age-gated videos: allow real login inside shell browser? | browser, engine | Answered | Yes — cookies persist in browsing WebView; extractor piggybacks session. |
| Q029 | Library/job metadata persistence across restarts | storage, engine | Answered | Persist metadata (localStorage) + native file existence sweep on launch. |
| Q030 | App name + icon direction | branding | Answered | Keep "Video Downloader" + existing purple mark; icon hot-swappable via Sideloadly later. |
| Q031 | In-app storage visibility: private container vs Files-app Documents? | storage, ios | Answered (B) | Fully private container (Library/); NO Files-app visibility, NO UIFileSharingEnabled. Files leave only via per-row share export. Consequence: in-app player required → Q041. |
| Q032 | Auto-download (skip sheet, one-tap best quality) setting? | ux, engine | Answered | Always confirm for v1; auto-download = v2 settings toggle. |
| Q033 | Multiple distinct videos on one page (feeds/grids) — pill count + source picker? | ux, browser, sniff | Answered (split) | v1: simple source picker list WITH thumbnails per source. Back-pocket v2: rich discovery UI (full links, auto-grouping, names, genres). |
| Q034 | Settings screen in v1? | ux, scope | Answered (settings yes) | Settings screen ships in v1 — user explicitly wants theme controls. |
| Q035 | Cellular guard (Wi-Fi-only downloads)? | pipeline, ios | Answered (conditional) | Native Wi-Fi check + "Waiting for Wi-Fi" state; only active on cellular-capable devices (no-op on Wi-Fi-only iPads). |
| Q036 | Orientation: portrait + landscape support? | ux, ios | Answered | Both orientations; landscape tuned for video watching. |
| Q037 | Dark-only vs follow system light mode? | ux, branding | Answered (via Q034) | Light mode required — theme setting with dark and light. |
| Q038 | Default start-page shortcut tiles (which sites)? | ux, browser | Answered | Curated four: YouTube, TikTok, Instagram, X. Editing tiles = back-pocket. |
| Q039 | Browser persistence when switching app tabs (Downloads etc.) | ux, shell | Answered | Suspend-and-freeze on leave (pause media via injected JS), restore on return; no reload. |
| Q040 | v1 acceptance criteria (the on-device test script) | scope, qa | Answered | Script locked (tiles → YouTube → pill → sheet → bg download → library after restart → nav/clipboard). Amendments pending via Q050. |
| Q041 | In-app player for library files (video + audio)? | ux, ios, scope | Answered | Native full-screen AVPlayer (video) + audio screen; library files only v1. |
| Q042 | Per-row export via system share sheet? | ux, ios | Answered | Yes — UIActivityViewController per finished row + player overflow; single escape hatch. |
| Q043 | Theme control shape (toggle vs system-follow)? | ux, settings | Answered | Three-way System/Dark/Light; default System. |
| Q044 | Storage usage indicator in Downloaded tab? | ux, storage | Answered | Yes — total size + count on Downloaded header via bridge. |
| Q045 | Delete confirmation dialog? | ux, storage | Answered | Confirm alert on file delete (not on removing unfinished jobs). |
| Q046 | Detection scope per browser tab (pill state)? | browser, sniff, ux | Answered | Per-tab detection lists keyed by tabId; pill/sheet reflect active tab. |
| Q047 | Engine routing: direct media URLs vs page URLs (variant parsing)? | engine, sniff | Answered | Route by sniff kind: page→JS extractor; hls→native manifest parse, variants as formats; video→single-entry sheet. |
| Q048 | First-run onboarding/permission explainer? | ux, onboarding | Answered | None v1; empty states teach. |
| Q049 | ATS: allow arbitrary http loads for streams? | ios, engine | Answered | NSAllowsArbitraryLoads = true. |
| Q050 | Acceptance script amendments (player + theme steps)? | scope, qa | Answered | Amended 9-step script locked (adds player, AirDrop export, theme switch, relaunch persistence). |
| Q051 | Progress visibility while browsing (badge vs floating mini-progress)? | ux, pipeline | Answered | Badge-only v1; floating strip back-pocket. |
| Q052 | Browser history + bookmarks in v1? | ux, browser, scope | Answered | Neither v1; both back-pocket (history should be visited-most ranked when built). |
| Q053 | Background audio playback for audio-only files? | ios, ux | Answered | Yes — UIBackgroundModes audio + AVAudioSession. |
| Q054 | Picture-in-Picture from the in-app player? | ios, ux | Answered | Yes — allowsPictureInPicturePlayback + delegate. |
| Q055 | Settings contents beyond theme? | ux, settings | Answered | Minimal set: Theme, app version + extractor version (read-only), Clear browsing data. |
| Q056 | Subtitles in the player v1? | ux, scope | Answered | Legible-track passthrough only; sidecar .srt/.vtt back-pocket. |
| Q057 | Error message style (friendly vs technical)? | ux, engine | Answered | Friendly + expandable technical details disclosure. |
| Q058 | Tab overview grid UI in v1? | ux, shell | Answered | Strip + swipe-to-close + long-press close/refresh; grid back-pocket. |
| Q059 | Download headers: Referer/UA forwarding for sniffed URLs? | engine, sniff | Answered | Forward pageURL as Referer + Safari UA on every transfer. |
| Q060 | Hot-fix integrity (pinned repo / hash pinning)? | engine, security | Answered | HTTPS + pinned repo; hash-pinning deferred; hot-fix JS executes in sandboxed cookie-less webview (never logged-in browsing webview). |
| Q061 | Build pipeline: scripted Theos/WSL vs manual? | build, ops | Answered | Scripted — tools/build.sh: web build → copy dist into Theos bundle → make package → re-sign. |
| Q062 | Signing identity: free Apple ID vs paid dev account? | build, ops | Answered | Free Apple ID for v1; paid optional later. |
| Q063 | Sideload tooling and re-sign cadence? | build, ops | Answered | Sideloadly + weekly cable re-sign; AltStore/SideStore back-pocket. |
| Q064 | Repo layout: web build embedded in native shell? | build, repo | Answered | Monorepo: web/ + ios/ + tools/; one clone, one build command. |
| Q065 | Versioning / tagging scheme for sideload milestones? | build, ops | Answered | Semver tags per sideloaded build; Settings version string reads the tag. |
| Q066 | On-device debugging / log strategy? | build, ops | Answered (+amend) | v1: Console.app over USB. User amendment: Settings-hosted in-app log console endorsed — promoted to back-pocket (user said "settings could actually keep a log console"). |
| Q067 | Hot-fix maintenance cadence when extractors break? | ops, engine | Answered | Fold 30-second detection check into weekly re-sign ritual; patch extractor → hot-fix push → app self-updates without re-sideload. |
| Q068 | Accessibility (VoiceOver, dynamic type) v1? | ux, ios | Answered | Targeted a11y: labels/hints on all controls + prefers-reduced-motion; Dynamic Type back-pocket. |
| Q069 | Data survival on re-sideload / app update? | ios, storage | Answered | Assume container + localStorage survive (same bundle ID + identity); verify on first weekly re-sign (acceptance addendum). |
| Q070 | Backup story for private-container files? | storage, ops | Answered | Manual per-file export + "Export All" row in Settings; iCloud auto-mirror back-pocket. |
| Q071 | Repo hygiene: what never gets committed? | repo, build | Answered | Denylist: *.ipa, *.p12, *.mobileprovision, tools/*.exe, UDIDs — .gitignore the moment ios/ exists. |
| Q072 | How do decisions reach DeepSeek (handoff protocol)? | process, repo | Answered | Ledger decisions table is canonical; DeepSeek reads before UI work; consolidated brief only at cluster boundaries. |
| Q073 | Branching model (main-only vs feature branches)? | repo, process | Answered | Main + short-lived ios/* branches only (shell doesn't compile mid-work); web work trunk-based; no PR ceremony. |
| Q074 | Post-v1 roadmap ordering (back-pocket priorities)? | scope, roadmap | Answered | Annoyance-first: 1) batch/playlist downloads, 2) visited-most history, 3) iPhone responsive pass, 4) cheap cosmetics batch. |
| Q075 | Scope fence: what is this product forever NOT? | scope, product | Answered | Never-list: no accounts, no cloud sync/storage, no Android/iPhone-first, no desktop, no social/marketplace, no monetization. |
| Q076 | When does discovery conclude (early-exit criteria)? | process | Answered | Two more rounds (Q081–Q100) then conclusion checkpoint: consolidated v1 spec doc, user approval, implementation resumes. |
| Q077 | Who maintains extractors long-term? | ops, engine | Answered | User is maintainer; I prepare patches on request; pushes always via user's explicit go. |
| Q078 | App lock (passcode/biometric) on launch? | ux, security | Answered | No app lock v1; optional toggle back-pocket. |
| Q079 | Notification permission ask timing? | ios, ux | Answered | Ask at first queued background download, with pre-prompt sheet then system dialog; content "Download complete: <title>". |
| Q080 | Release trains: shell changes vs extractor changes? | ops, build | Answered | Two-track formalized: Track A (hot-fix JS, no sideload) / Track B (native/shell/UI, build.sh + weekly re-sign). |
| Q081 | iPad model fact: Wi-Fi-only or cellular? | ios, facts | Answered (conditional retained) | Guard ships dormant-or-active via NWPathMonitor; model still unstated — fine, nothing blocked. |
| Q082 | YouTube edge cases: age-gate, consent, bot-check pages? | browser, engine, sites | Answered | Manual dismissal only; never build captcha/age-gate/anti-bot bypasses (→ never-list). |
| Q083 | TikTok: login walls / interstitials? | browser, sites | Answered | Log in manually when asked; no special-casing; interstitials dismissed by user. |
| Q084 | Instagram: login wall for reels/feed? | browser, sites | Answered | Log in once, cookies persist (WKWebsiteDataStore); Q060 sandbox is the guardrail. |
| Q085 | X/Twitter: video-in-tweet sniffing specifics? | browser, sites | Answered | Universal path (Q047 routing), no special-casing; breakage → Track A hot-fix. |
| Q086 | Pre-roll ads detected alongside real content — filter or not? | sniff, sites | Answered (+amend) | No sheet-filtering heuristics. AMENDED: bundled WKContentRuleList browser-level ad-blocker YES — generic ad networks/popups/trap buttons blocked; youtube.com/ytimg.com/googlevideo.com whitelisted; rule JSON hot-updatable via Track A; blocks requests only, never bypasses protections (Q082 fence intact). |
| Q087 | Cookie/consent banners delaying detection? | browser, sites | Answered | Continuous DOM-mutation re-arm formalized (pill appears when video element mounts); no user refresh needed. |
| Q088 | DRM content (Netflix/Disney+/Spotify) — fence? | engine, security | Answered | Never-list line: never attempt FairPlay/Widevine/PlayReady decryption; optional "protected stream" status message later. |
| Q089 | Source list churn on quality switch / mid-play? | sniff, engine | Answered | Replace-on-change with recency ordering; superseded same-page entries dropped. |
| Q090 | Free-space check before download start? | storage, engine | Answered | Check + blocking warn ("Not enough space"), 1GB absolute floor, Download-Anyway override. |
| Q091 | Approve v1-spec writing + discovery conclusion procedure? | process | Answered (approved) | Spec = docs/discovery/v1-spec.md; single user review; approval ends freeze. |
| Q092 | Open floor: anything still unresolved in the user's head? | process | Answered (disclosures) | (a) v3 direction: immersive multi-view vertical playback ("no hands" continuous play, 2–3 side-by-side landscape, playlist-driven stacking) — recorded as named seed. (b) Product soul: user wants the app to become their music player — honors a legacy free YouTube-download-playlist app; audio library + playlists are the emotional core, not an afterthought; v1 foundation already laid (Q023/Q053). No v1 scope change. |
| Q093 | Light-mode palette: design now or at implementation? | ux, settings | Answered | At implementation — every token gets a light counterpart; DeepSeek owns the fork; spec records the rule only. |
| Q094 | First-week soak-test plan after sideload? | qa | Answered | Formal soak: docs/soak-log.md one-liner per observation; day-7 triage into fix/back-pocket/never; validates Q069 re-sign survival. |
| Q095 | Shorts / vertical video special-casing? | ux, browser | Answered (immersive follow-up) | v1: no special-casing (Q089 replace-on-change handles feeds). User asked "could it be immersive?" — answer: yes technically (aspect-ratio detection + stacked players + playlist cursor); recorded as v3 seed alongside Q092(a). |
| Q096 | HLS variant list cap in the source sheet? | ux, engine | Answered | Cap 8, deduped by resolution, height-descending, plus separate audio row. |
| Q097 | iPad Split View / Slide Over support? | ux, ios | Answered | Supported; opt-out later is one plist line if half-width breaks badly. |
| Q098 | Downloaded tab default sort order? | ux, storage | Answered | Newest-first, no sort options v1. |
| Q099 | Hot-fix repo name + conventions? | ops, engine | Answered | Private `video-downloader-extractors`, main-only, payload/ + manifest.json (version, sha256 per file); commit-and-push = live. |
| Q100 | Disposition of DeepSeek's current uncommitted scaffold? | repo, process | Answered | Freeze-and-restructure at conclusion: working tree keeps churning until spec approval; first post-freeze commit = monorepo restructure + .gitignore denylist; DeepSeek gets updated paths in handoff note. |

---

## Never-list (forever out of scope — Q075, Q082, Q088)

- No accounts, no cloud sync/storage
- No Android or iPhone-first support (iPhone = responsive courtesy only)
- No desktop companion app
- No social/marketplace features
- No monetization
- No captcha / age-gate / anti-bot bypasses (Q082)
- No DRM decryption attempts — FairPlay/Widevine/PlayReady (Q088)

## Back-pocket (deferred, not MVP)

- Playlist / batch downloads (Q024)
- Share-sheet *extension* ("Share to app" from other apps) (Q025)
- Auto-download / one-tap best-quality setting (Q032)
- Rich multi-source discovery UI: full link lists, auto-grouping, names, genres (Q033 v2)
- iPhone layout pass (responsive CSS kept; cheap later) (Q027)
- Editable start-page tiles (Q038)
- Settings extras beyond themes (clipboard toggle, wifi-only toggle surfacing, etc.) (Q034)
- Light-mode-independent branding pass / custom icon (Q030)
- **Multi-view immersive mode (v3 seed, Q092a/Q095)**: auto-detect vertical sources via aspect-ratio observers; 2–3 side-by-side landscape layout; hands-free continuous play; playlist-driven stacking
- **Music-player mode (v2–v3 seed, Q092b)**: audio-first UI, richer metadata/artwork, playlist-centric library — the legacy YouTube-download→playlist loop the user wants the app to honor; rides directly on Q074's #1 item (batch/playlists)

## Progress

- Checkpoint 1: Round 1 answered (Q001–Q010) · biggest pivot: **on-device engine, no server** (Q001/Q009)
- Checkpoint 2: Round 2 answered (Q011–Q020) · engine locked: **JS extractor + native transfers + resume + background sessions** (Q011–Q013, Q019/Q020); unlimited parallel (Q018)
- Checkpoint 3: Round 3 answered (Q021–Q030) · scope calls: **ffmpeg LGPL v1** (Q021), **audio-only v1** (Q023), **in-app-only storage** (Q022, clarify → Q031); deferrals: playlists/share-extension (back-pocket)
- Checkpoint 4: Round 4 answered (Q031–Q040) · major calls: **fully private storage** (Q031-B), **Settings + light mode ship v1** (Q034/Q037), acceptance script locked (Q040)
- Checkpoint 5: Round 5 answered (Q041–Q050) · consumption model locked: **in-app player + share-sheet export** (Q041/Q042), **three-way theme** (Q043), amended 9-step acceptance script (Q050)
- Checkpoint 6: Round 6 answered (Q051–Q060) · playback model locked: **background audio + PiP + legible-track passthrough** (Q053–Q056), **Referer/UA forwarding** (Q059), **hot-fix sandbox hardening** (Q060)
- Checkpoint 7: Round 7 answered (Q061–Q070) · ops model locked: **scripted Theos build + monorepo + free-ID weekly re-sign + two-track hot-fix loop** (Q061–Q067); user amendment: Settings-hosted log console promoted to back-pocket (Q066)
- Checkpoint 8: Round 8 answered (Q071–Q080) · 80/200 answered · process locked: **ledger-as-handoff + never-list fence + two-track release model + conclusion at ~Q100** (Q072–Q080)
- Checkpoint 9: Round 9 answered (Q081–Q090) · 90/200 answered · site-behavior policy locked: **manual dismissal, no anti-bot/DRM bypass, universal sniff path** (Q082–Q088); **WKContentRuleList ad-blocker added** (Q086 amend); **replace-on-change** detection churn rule (Q089); **free-space guard** (Q090)
- Round 10 issued: Q091–Q100 (final consistency pass + spec procedure) · 100/200 asked
- Checkpoint 10: Round 10 answered (Q091–Q100) · 100/200 — **discovery CONCLUDED via early-exit (Q076)** with full user consent; procedure approved (Q091); open-floor seeds recorded (Q092/Q095: immersive multi-view v3, music-player mode v2–v3)
- **v1-spec.md written — PENDING user review; approval ends the implementation freeze**
