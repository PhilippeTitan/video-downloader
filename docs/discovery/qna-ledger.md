# Product Discovery — QnA Ledger

> Protocol: `PRODUCT_DISCOVERY.md` · Target: **200 questions** · Cadence: checkpoint every **9** unique answers
> Phase 1 (warm-up): 3 questions/round · Phase 2 (deep): 10 questions/round

---

## Pre-settled decisions (dedup anchors — never re-ask)

| ID | Canonical Intent | Domain Tags | Status / Disposition | Decision Note |
|---|---|---|---|---|
| S001 | In-app browser = native shell (browsing WKWebView under chrome UI); never redirect/external tab | architecture, browser, shell | Settled | Two-WebView chrome-over-content; chosen over iframe (sites refuse framing) and UI-only mock. |
| S002 | Download pill (ring: scanning/ready/error) → bottom sheet with source data | ux, pill, sheet | Settled | Sheet rises to mid-screen; drag-down/backdrop/X dismiss; Download CTA lives in sheet. **Amended by Q104:** the native FAB now plays the pill's role. |
| S003 | Address bar flies up to browser-style top bar on navigation | ux, nav | Settled | Idle centered hero → active top bar; clearing bar resets to idle. |
| S004 | Address bar accepts bare domains + free text; free text → YouTube search | nav, search | Settled | `youtube.com` → https; `funny cats` → youtube results page. **Amended by Q101:** search goes straight to youtube.com/results; the generated results page and Archive.org fallback are dropped. |
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
| Q007 | Browser chrome needs back/forward/reload + history state | ux, shell, nav | Answered | Web-driven via bridge: shell pushes canGoBack/canGoForward/isLoading/url; top bar renders back + reload. **Amended by Q113:** back/forward/reload controls now live in the native rail. |
| Q008 | What does the browser start page / homepage show? | ux, browser, onboarding | Answered | Brand + bar + row of site shortcut tiles (YouTube first). |
| Q009 | Service-down UX + does demo mode ship in the .ipa? | reliability, offline | Superseded | No PC service (Q001). Demo/fake mode should not ship by default. |
| Q010 | Multi-tab browsing vs single tab for v1 | scope, shell, ux | Answered (multi-tab) | Multi-tab is a v1 requirement (user explicitly chose over single-tab recommendation). |
| Q011 | Engine placement: JS extractor in web UI vs native code | architecture, engine | Answered | JS extractor (e.g. @distube/ytdl-core) bundled in web UI resolves formats/URLs; transfer stays native (Q013). |
| Q012 | Stream strategy: progressive MP4 only vs HLS + muxing | engine, pipeline, scope | Answered (full scope) | User requires MP4 + HLS + ffmpeg muxing in v1 (rejected progressive-only). ffmpeg ships in app; mux audio+video HLS to MP4 natively. **Amended by Q114:** AVFoundation passthrough remux is evaluated first; ffmpeg only if that falls short. |
| Q013 | Download transport: native URLSession via bridge vs web fetch | architecture, engine, ios | Answered | Native URLSession in shell, bridge messages start/cancel + progress events. |
| Q014 | File naming, duplicates, and storage cleanup policy | storage, ux | Answered | Sanitized `Title - 1080p.mp4`; duplicates auto-suffix ` (2)`; per-row in-app delete; never auto-delete. |
| Q015 | Keep api.ts interface as local-engine adapter? | architecture, code | Answered | LocalEngine class implements ApiClient; connect() returns it; REST client + demo mode retired. |
| Q016 | Tab model: persistence across restart + tab cap | shell, ux, scope | Answered | Persist tab URLs across restart, cap 10, strip above bottom nav. |
| Q017 | Extractor hot-fix strategy when YouTube breaks the engine | engine, reliability | Answered | Remote hot-fix (fetch latest extractor JS from own GitHub), bundled fallback copy; active version surfaced in UI. |
| Q018 | Concurrent downloads: parallel count / queue behavior | pipeline, ux | Answered (unlimited) | Unlimited parallel downloads; no artificial slots (user rejected 2-slot recommendation). |
| Q019 | Resume partial downloads after interruption | pipeline, reliability | Answered | HTTP Range resume from day one; auto-resume on reconnect. |
| Q020 | Backgrounding: downloads continue when app is closed | pipeline, ios | Answered | Background URLSessionConfiguration from day one; system continues transfers + posts its own completion notification. |
| Q021 | ffmpeg build flavor + .ipa size budget | engine, ios, scope | Answered | LGPL static build, stream-copy only; ~60MB .ipa expected. **Amended by Q114:** ffmpeg is now conditional, so the size budget applies only if it ships. |
| Q022 | Save destination: Photos app vs Files/Documents vs both | storage, ux, ios | Answered (clarify pending) | NOT Photos, NOT system Downloads — files stay local to the app only. Pending: app-private container vs Documents visible in Files app → Q031. |
| Q023 | Audio-only downloads (m4a) in v1? | engine, scope, ux | Answered | Yes — audio section in format sheet; engine work minimal. |
| Q024 | Playlist/batch download support in v1? | scope, engine | Answered (deferred) | Back-pocket v2; single-video loop must prove itself first. |
| Q025 | Share-sheet extension ("Share to app") in v1? | ios, ux, scope | Answered (deferred) | Back-pocket v2; clipboard detection covers the habit in v1. |
| Q026 | Clipboard detection on app open (offer copied link)? | ux, ios | Answered | Yes — auto-read on foreground when clipboard looks like a URL; prefilled bar + lit pill, user confirms. |
| Q027 | Min iOS version + iPad-only vs iPhone universal | ios, scope | Answered | iOS 16 minimum, iPad-only for v1 (responsive CSS kept for cheap iPhone v2). |
| Q028 | Login/age-gated videos: allow real login inside shell browser? | browser, engine | Answered | Yes — cookies persist in browsing WebView; extractor piggybacks session. |
| Q029 | Library/job metadata persistence across restarts | storage, engine | Answered | Persist metadata (localStorage) + native file existence sweep on launch. **Amended by Q129:** metadata moves to a native JSON file in Library/. |
| Q030 | App name + icon direction | branding | Answered | Keep "Video Downloader" + existing purple mark; icon hot-swappable via Sideloadly later. |
| Q031 | In-app storage visibility: private container vs Files-app Documents? | storage, ios | Answered (B) | Fully private container (Library/); NO Files-app visibility, NO UIFileSharingEnabled. Files leave only via per-row share export. Consequence: in-app player required → Q041. |
| Q032 | Auto-download (skip sheet, one-tap best quality) setting? | ux, engine | Answered | Always confirm for v1; auto-download = v2 settings toggle. |
| Q033 | Multiple distinct videos on one page (feeds/grids) — pill count + source picker? | ux, browser, sniff | Answered (split) | v1: simple source picker list WITH thumbnails per source. Back-pocket v2: rich discovery UI (full links, auto-grouping, names, genres). **Refined by Q131:** a single source skips the picker. |
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
| Q051 | Progress visibility while browsing (badge vs floating mini-progress)? | ux, pipeline | Answered | Badge-only v1; floating strip back-pocket. **Amended by Q104:** the badge now sits on the FAB and counts active downloads. |
| Q052 | Browser history + bookmarks in v1? | ux, browser, scope | Answered | Neither v1; both back-pocket (history should be visited-most ranked when built). **Amended by Q126:** a small recents list ships in v1; full history stays back-pocket. |
| Q053 | Background audio playback for audio-only files? | ios, ux | Answered | Yes — UIBackgroundModes audio + AVAudioSession. |
| Q054 | Picture-in-Picture from the in-app player? | ios, ux | Answered | Yes — allowsPictureInPicturePlayback + delegate. |
| Q055 | Settings contents beyond theme? | ux, settings | Answered | Minimal set: Theme, app version + extractor version (read-only), Clear browsing data. **Amended by Q138:** defines exactly what Clear browsing data clears and keeps. |
| Q056 | Subtitles in the player v1? | ux, scope | Answered | Legible-track passthrough only; sidecar .srt/.vtt back-pocket. |
| Q057 | Error message style (friendly vs technical)? | ux, engine | Answered | Friendly + expandable technical details disclosure. |
| Q058 | Tab overview grid UI in v1? | ux, shell | Answered | Strip + swipe-to-close + long-press close/refresh; grid back-pocket. **Amended by Q125:** the tab-switcher overlay and drag-reorder are now v1. |
| Q059 | Download headers: Referer/UA forwarding for sniffed URLs? | engine, sniff | Answered | Forward pageURL as Referer + Safari UA on every transfer. |
| Q060 | Hot-fix integrity (pinned repo / hash pinning)? | engine, security | Answered | HTTPS + pinned repo; hash-pinning deferred; hot-fix JS executes in sandboxed cookie-less webview (never logged-in browsing webview). |
| Q061 | Build pipeline: scripted Theos/WSL vs manual? | build, ops | Answered | Scripted — tools/build.sh: web build → copy dist into Theos bundle [amended by Q118: the build runs on GitHub Actions macos-14, not WSL] → make package → re-sign. |
| Q062 | Signing identity: free Apple ID vs paid dev account? | build, ops | Answered | Free Apple ID for v1; paid optional later. |
| Q063 | Sideload tooling and re-sign cadence? | build, ops | Answered | Sideloadly + weekly cable re-sign; AltStore/SideStore back-pocket. |
| Q064 | Repo layout: web build embedded in native shell? | build, repo | Answered | Monorepo: web/ + ios/ + tools/; one clone, one build command. |
| Q065 | Versioning / tagging scheme for sideload milestones? | build, ops | Answered | Semver tags per sideloaded build; Settings version string reads the tag. |
| Q066 | On-device debugging / log strategy? | build, ops | Answered (+amend) | v1: Console.app over USB. User amendment: Settings-hosted in-app log console endorsed — promoted to back-pocket (user said "settings could actually keep a log console"). **Amended by Q117:** the in-app log console is promoted to v1. |
| Q067 | Hot-fix maintenance cadence when extractors break? | ops, engine | Answered | Fold 30-second detection check into weekly re-sign ritual; patch extractor → hot-fix push → app self-updates without re-sideload. |
| Q068 | Accessibility (VoiceOver, dynamic type) v1? | ux, ios | Answered | Targeted a11y: labels/hints on all controls + prefers-reduced-motion; Dynamic Type back-pocket. |
| Q069 | Data survival on re-sideload / app update? | ios, storage | Answered | Assume container + localStorage survive (same bundle ID + identity); verify on first weekly re-sign (acceptance addendum). |
| Q070 | Backup story for private-container files? | storage, ops | Answered | Manual per-file export + "Export All" row in Settings; iCloud auto-mirror back-pocket. |
| Q071 | Repo hygiene: what never gets committed? | repo, build | Answered | Denylist: *.ipa, *.p12, *.mobileprovision, tools/*.exe, UDIDs — .gitignore the moment ios/ exists. |
| Q072 | How do decisions reach DeepSeek (handoff protocol)? | process, repo | Answered | Ledger decisions table is canonical; DeepSeek reads before UI work; consolidated brief only at cluster boundaries. |
| Q073 | Branching model (main-only vs feature branches)? | repo, process | Answered | Main + short-lived ios/* branches only (shell doesn't compile mid-work); web work trunk-based; no PR ceremony. **Amended by Q118:** work now lands through MRs on GitLab. |
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
| Q086 | Pre-roll ads detected alongside real content — filter or not? | sniff, sites | Answered (+amend) | No sheet-filtering heuristics. AMENDED: bundled WKContentRuleList browser-level ad-blocker YES — generic ad networks/popups/trap buttons blocked; youtube.com/ytimg.com/googlevideo.com whitelisted; rule JSON hot-updatable via Track A; blocks requests only, never bypasses protections (Q082 fence intact). **Sequencing by Q139:** a bundled rule list ships first; hot updates follow once the hot-fix repo exists. |
| Q087 | Cookie/consent banners delaying detection? | browser, sites | Answered | Continuous DOM-mutation re-arm formalized (pill appears when video element mounts); no user refresh needed. **Amended by Q124:** implemented with MutationObserver plus a throttled scan, not a fixed interval. |
| Q088 | DRM content (Netflix/Disney+/Spotify) — fence? | engine, security | Answered | Never-list line: never attempt FairPlay/Widevine/PlayReady decryption; optional "protected stream" status message later. |
| Q089 | Source list churn on quality switch / mid-play? | sniff, engine | Answered | Replace-on-change with recency ordering; superseded same-page entries dropped. |
| Q090 | Free-space check before download start? | storage, engine | Answered | Check + blocking warn ("Not enough space"), 1GB absolute floor, Download-Anyway override. |
| Q091 | Approve v1-spec writing + discovery conclusion procedure? | process | Answered (approved) | Spec = docs/discovery/v1-spec.md; single user review; approval ends freeze. |
| Q092 | Open floor: anything still unresolved in the user's head? | process | Answered (disclosures) | (a) v3 direction: immersive multi-view vertical playback ("no hands" continuous play, 2–3 side-by-side landscape, playlist-driven stacking) — recorded as named seed. (b) Product soul: user wants the app to become their music player — honors a legacy free YouTube-download-playlist app; audio library + playlists are the emotional core, not an afterthought; v1 foundation already laid (Q023/Q053). No v1 scope change. |
| Q093 | Light-mode palette: design now or at implementation? | ux, settings | Answered | At implementation — every token gets a light counterpart; DeepSeek owns the fork; spec records the rule only. |
| Q094 | First-week soak-test plan after sideload? | qa | Answered | Formal soak: docs/soak-log.md one-liner per observation; day-7 triage into fix/back-pocket/never; validates Q069 re-sign survival. **Extended by Q140:** the log also records A/B frame-time notes. |
| Q095 | Shorts / vertical video special-casing? | ux, browser | Answered (immersive follow-up) | v1: no special-casing (Q089 replace-on-change handles feeds). User asked "could it be immersive?" — answer: yes technically (aspect-ratio detection + stacked players + playlist cursor); recorded as v3 seed alongside Q092(a). |
| Q096 | HLS variant list cap in the source sheet? | ux, engine | Answered | Cap 8, deduped by resolution, height-descending, plus separate audio row. |
| Q097 | iPad Split View / Slide Over support? | ux, ios | Answered | Supported; opt-out later is one plist line if half-width breaks badly. |
| Q098 | Downloaded tab default sort order? | ux, storage | Answered | Newest-first, no sort options v1. |
| Q099 | Hot-fix repo name + conventions? | ops, engine | Answered | Private `video-downloader-extractors`, main-only, payload/ + manifest.json (version, sha256 per file); commit-and-push = live. **Sequencing by Q130:** the repo and loader are created after the engine works; a bundled fallback ships first. |
| Q100 | Disposition of DeepSeek's current uncommitted scaffold? | repo, process | Answered | Freeze-and-restructure at conclusion: working tree keeps churning until spec approval; first post-freeze commit = monorepo restructure + .gitignore denylist; DeepSeek gets updated paths in handoff note. |
| Q101 | Where do search results come from in the shipped app? | browser, search, backend | Answered | Browsing WebView goes straight to youtube.com/results. The generated /api/webview-search page and the Archive.org fallback are dropped (dev-only middleware, conflicts with Q001). Amends S004. |
| Q102 | Purpose of expo-app/? | architecture, build, testing | Answered (resolved by Q111) | Built as the owner's own way to test UI and functionality before bundling an .ipa (Expo Go). The React Native vs Obj-C Theos shell gap limits fidelity. Treated as a dev-only preview, never shipped. A shared bridge contract to stop drift is proposed, resolved in Q111. |
| Q103 | Download behavior when a page has no direct file? | engine, ux, pipeline | Answered | Sequencing note: wire direct mp4/audio first; HLS and the YouTube extractor follow within v1 scope (Q109). Any kind not yet wired shows an explicit "Detected, not downloadable yet" state. Remove the simulated progress and hard-coded sizes; show unknown size as unknown. Enforces Q009. |
| Q104 | Is the magnet FAB the download pill, and what does its badge count? | ux, pill, shell | Answered | The FAB is the download button and replaces the pill. Keeps scanning/ready/error states. Badge = active downloads. Tapping the FAB opens the source sheet (carried over from S002/Q006). Amends S002 and Q051 (pointers added on those rows). **Extended by Q132:** the FAB shows aggregate progress with a soft glow. |
| Q105 | Policy for the scan/load animation | ux, animation | Answered (+aesthetic) | Aesthetic is deliberate: soft, smooth, unhurried transitions, not fast-paced. Sweep tied to real page-load progress; a loaded page is never held back; CSS transform/opacity only; prefers-reduced-motion honored. Timing tokens set in Q116. |
| Q106 | Safari gestures on the browsing pane | ux, shell, browser | Answered | Enable edge-swipe back/forward and link long-press (open in new tab, copy link). Keep native pull-to-refresh. Test the clash with the rail handle on the iPad. |
| Q107 | Popups and target=_blank behavior | browser, nav | Answered | A user tap opens a new tab. Script popups with no tap are blocked silently. At the 10-tab cap (Q016) the link loads in the current tab with a toast. |
| Q108 | Scope of desktop-class UA and m. to www. rewrite | browser, sites, engine | Answered (+amend) | Desktop-class iPad UA everywhere with a small per-site override list. The m. to www. rewrite is YouTube only. Transfer UA matches browsing UA (extends Q059). AMENDED: pages must never redirect or jump into a site's native iOS app; deep-link schemes and universal-link app handoffs are blocked (extends commit 08cc8f0f). |
| Q109 | Scraper coverage target | sniff, engine, scope | Answered | Engine v1 covers progressive files, HLS and the YouTube extractor. The sniffer detects every kind (including DASH and blob streams); unsupported kinds show "Detected, not downloadable yet" so nothing is silently missed. DRM stays fenced (Q088). |
| Q110 | How private tabs behave | browser, privacy, ux | Answered | Non-persistent website data store. Not saved across restart, not added to recents, visually distinct. Downloads still go to the library. |
| Q111 | How is UI and functionality tested before bundling an .ipa? | testing, build, ci | Answered | Desktop-Chrome-at-iPad-size harness with a mock bridge, run on every push, plus a CI job running the same checks. expo-app/ stays as a secondary preview only. Limit: this cannot measure WKWebView compositing or the stacked-WebView cost; only the real .ipa on the iPad shows that. Closes the Q102 follow-up. |
| Q112 | Who owns tab state between the UI and the shell? | shell, tabs, bridge | Answered | The shell owns pages and history; the UI owns the chrome. Explicit messages both ways (new, switch, close, sync). Fixes the gap where the UI only sent syncTabs and the shell had no handlers. |
| Q113 | What lives in the native rail vs the web chrome? | ux, shell | Answered | The native rail holds the controls; the web chrome keeps only tabs and search. No duplicated controls. Amends Q007. |
| Q114 | How is HLS muxing built? | engine, build | Answered | Evaluate AVFoundation passthrough remux first; add a static LGPL ffmpeg only if that falls short. Keeps the .ipa small and the build simple. Amends Q012 and Q021. |
| Q115 | What happens when a page fails to load? | ux, browser | Answered | A soft, in-style error card with Retry and a plain reason, not the browser's default error page. Native load errors must reach the UI (currently ignored). |
| Q116 | Animation timing tokens? | ux, animation | Answered | "Soft" set: standard 350 ms, sheet 450 ms, ease-out curve. Defined once as CSS variables. prefers-reduced-motion cuts them to near zero. Completes Q105. |
| Q117 | How are logs read when development is on Windows? | build, ops, debugging | Answered | Promote the in-app log console from back-pocket to v1, and fix debugLog so messages reach it. User noted the app is iPad-only; Console.app is Mac-only, so it can't be the v1 log path. Amends Q066. |
| Q118 | Which repo is canonical and how do changes land? | process, repo, ci | Answered | GitLab is canonical. Work lands through MRs the user merges. The push mirror feeds GitHub, whose Actions runs the iOS build (macos-14). Amends Q073 and Q061. |
| Q119 | Add a root AGENTS.md? | process, repo | Answered | Yes: one root file pointing to the ledger and the never-list, with build and test rules. Not yet written (discovery freeze). |
| Q120 | Is v1-spec.md approved now? | process | Answered | User decided: approve with an amendments list covering Q101-Q119, and regenerate the spec at the next checkpoint. Spec edit pending: the file still says PROPOSED (discovery freeze). |
| Q121 | What happens to dev-only files in the repo? | repo, hygiene | Answered | Remove tools/ngrok/ngrok.exe and the .aistudio/ agent notes from the tree; .gitignore gets tools/**/*.exe and .aistudio/. The binary stays in git history; rewriting history is a separate decision. Not yet applied (discovery freeze). |
| Q122 | What stays of web/server/api.ts? | backend, code, security | Answered | Kept as a dev-only mock, moved under dev/ and excluded from the bundle. Deleted once LocalEngine (Q015) exists. The HTML-injection issues in the generated search page must be fixed or removed with it. |
| Q123 | How is App.tsx broken up? | code, performance | Answered | Incremental extraction, not a rewrite: animation loop and tab state first, then sheet and bridge. Each step is checked by the Q111 harness. |
| Q124 | Sniffer scan frequency | sniff, performance | Answered | MutationObserver plus a throttled scan, with a slow safety rescan every few seconds. The fixed 400 ms interval goes. Amends Q087. |
| Q125 | Tab-switcher overlay vs Q058 | ux, shell, tabs | Answered (+follow-up) | The built tab-switcher overlay and drag-reorder are v1. Follow-up: user wants the animation updated; to be scoped in a later round. Amends Q058. |
| Q126 | What is the recents list? | ux, browser, privacy | Answered | Last 8 search or URL entries, skips private tabs (Q110), clear button in Settings. First-run seed entries are dropped. Amends Q052. |
| Q127 | Do pull-to-refresh and the static-frame wipe stay? | ux, animation | Answered | Keep both. The wipe becomes a CSS transform with a reduced-motion fallback. Check its cost on the iPad before any cut. |
| Q128 | How do failed downloads behave? | pipeline, ux, reliability | Answered | Auto-retry up to 3 times (using Range resume, Q019), then the job stays in Downloads with Retry and Remove and expandable technical details (Q057). |
| Q129 | Where does library metadata live? | storage, ios | Answered | A native JSON file in Library/. Clear browsing data (Q055) and WebView storage resets can't touch it. Amends Q029. |
| Q130 | Does the hot-fix repo exist yet? | ops, engine | Answered | Created after the engine works. A bundled extractor fallback ships first. Sequencing note on Q099. |
| Q131 | How does the download button handle several detected sources? | ux, sheet, sniff | Answered | One detected source goes straight to the format sheet; two or more open the source picker (with thumbnails) first. Refines Q033. |
| Q132 | What does the FAB do while a download is running? | ux, pill, pipeline | Answered (+animation) | A ring around the FAB shows aggregate progress with a soft glow while something downloads (user request). Tap rule: with active downloads, a tap opens the Downloads tab; the source sheet opens when a new source is ready. The glow follows the Q116 timing tokens and honors prefers-reduced-motion. Extends Q104. |
| Q133 | Does the rail auto-hide stay? | ux, shell | Answered | Keep auto-hide. Move the rail handle out of the edge-swipe zone (Q106). Check the touch conflict on the iPad. |
| Q134 | How is the desktop-class UA validated per site? | browser, sites, qa | Answered | A per-site override list, tested in the Q111 harness and on the iPad, starting with the four start-page tiles (YouTube, TikTok, Instagram, X). Follows Q108. |
| Q135 | Do the two shells load the same web build? | build, architecture | Answered | Yes. The Theos shell and the Expo preview both load the same Vite build output, produced by one build script, so the paths cannot drift. Supports Q102. |
| Q136 | Safe-area and keyboard behavior | ux, ios, layout | Answered | Use env(safe-area-inset-*) and the visual viewport, and test portrait, landscape and Split View (Q097). No fixed offsets. |
| Q137 | Same source started twice? | pipeline, ux | Answered | A same-URL, same-format request while the first is active shows "Already downloading". Once the first has finished, a new one is allowed and the filename is suffixed (Q014). |
| Q138 | What does Clear browsing data clear? | settings, privacy, storage | Answered | Clears cookies, cache, recents (Q126) and saved tab URLs. Never touches the library or downloads (Q129). A confirm dialog names what stays. Amends Q055. |
| Q139 | Ad-blocker rules: bundled vs hot-updated? | engine, ops | Answered | A bundled rule list ships first. Hot updates (Q086) follow once the hot-fix repo exists (Q130). |
| Q140 | How is iPad performance checked? | qa, performance, ci | Answered (+follow-up) | An A/B .ipa with a Settings flag for the stacked-WebView and corner-clip variants; frame-time notes go in docs/soak-log.md (Q094). User asked whether GitLab CI/CD can test this: CI can run the Q111 harness and web checks on every push, but real frame times only come from the iPad. |

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
- **v1-spec.md written — PENDING user review; approval ends the implementation freeze** (Update: Q120 records the user's decision to approve with an amendments list. The spec file still says PROPOSED until it is edited.)
- Discovery reopened after the app was built with extra agents (animations, native rail, FAB). The ledger is behind the code; later rounds reconcile it. The code now has a tab-switcher overlay (vs Q058), a recents list (vs Q052), and a native FAB (vs S002). The build runs on GitHub Actions macos-14, not WSL (vs Q061).
- Checkpoint 11: Round 11 answered (Q101-Q110) | 110/200 | reconciliation round: **search goes straight to YouTube** (Q101), **FAB is the download button** (Q104), **soft animation aesthetic tied to real load** (Q105), **Safari gestures + popup policy** (Q106/Q107), **desktop-class UA + no native-app redirects** (Q108), **sniff everything, download what's supported** (Q109), **private tabs** (Q110). The Q102 follow-up on testing is closed in Q111.
- Checkpoint 12: Round 12 answered (Q111-Q120) | 120/200 | process and structure locked: **desktop-Chrome mock-bridge test harness + CI** (Q111), **shell owns tabs** (Q112), **native rail owns controls** (Q113), **AVFoundation remux before ffmpeg** (Q114), **soft error card** (Q115), **350/450 ms animation tokens** (Q116), **in-app log console in v1** (Q117), **GitLab canonical, MRs** (Q118), **root AGENTS.md** (Q119), **v1 spec approval decided, spec edit pending** (Q120).
- Checkpoint 13: Round 13 answered (Q121-Q130) | 130/200 | code and repo hygiene locked: **remove ngrok.exe and agent notes** (Q121), **api.ts becomes a dev-only mock** (Q122), **incremental App.tsx split** (Q123), **observer-based sniffer** (Q124), **tab switcher is v1** (Q125), **recents list** (Q126), **keep pull-to-refresh and wipe** (Q127), **auto-retry then Retry/Remove** (Q128), **native library metadata** (Q129), **hot-fix repo after engine** (Q130). Open: tab-switcher animation update (Q125 follow-up).
- Checkpoint 14: Round 14 answered (Q131-Q140) | 140/200 | interaction and verification locked: **single source skips the picker** (Q131), **FAB progress ring with soft glow** (Q132), **rail handle clear of the swipe zone** (Q133), **per-site UA overrides** (Q134), **one shared web build** (Q135), **safe-area and keyboard rules** (Q136), **"Already downloading"** (Q137), **Clear browsing data scope** (Q138), **bundled ad-block rules first** (Q139), **A/B .ipa performance check** (Q140). Open: how much of Q140 and Q111 runs in GitLab CI.
