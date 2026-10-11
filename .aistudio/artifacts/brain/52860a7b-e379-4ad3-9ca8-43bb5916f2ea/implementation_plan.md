# Download Action Button & Sheet Cleanup

Transform the floating download action button into a modern squircle (rounded square) positioned vertically centered on the right edge, and clean up the download sheet by removing pre-configured placeholder text and mock format chips.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during clarification:
> - **Position**: Vertically centered on the right edge of the screen (`top: 50%`, `transform: translateY(-50%)`, `right: 24px`).
> - **Shape & Dimensions**: Medium squircle (`56×56 px` with `16px` border-radius) with an icon-only presentation.
> - **Download Sheet Cleanup**: Strip out hardcoded placeholder titles (such as "Mountain Road Timelapse") and mock chip clutter, presenting a clean, streamlined modal focused on live detected media.

---

## 1. Overview & Core Concept

- **What It Delivers**:
  - Replaces the bottom-right pill button with a floating, thumb-accessible squircle tile anchored at the vertical midpoint of the right edge.
  - Cleans the "Save this video" modal sheet to eliminate hardcoded sample metadata and mock format pills, creating an authentic, distraction-free download flow.
- **Key Value**: Unobstructed bottom content area, ergonomic one-handed reach on both tablets and mobile viewports, and clean visual design with no fake sample content.

---

## 2. User Experience & Visual Design

### A. Floating Squircle Trigger
- **Geometry**: `56px × 56px` square with `16px` corner radius (`border-radius: 16px`).
- **Placement**: Fixed on the right edge, vertically centered (`position: absolute`, `right: 24px`, `top: 50%`, `transform: translateY(-50%)`).
- **Color & Shadow**: Vibrant accent (`#7c5cff`), crisp white download glyph (`26×26px` SVG download tray arrow), and multi-layer drop shadow (`0 8px 24px rgba(124, 92, 255, 0.45), 0 2px 6px rgba(0, 0, 0, 0.3)`).
- **Interactive Feedback**: Smooth press compression (`active:scale(0.92)` with `transition: transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)`).
- **Badge Indicator**: When a downloadable media stream is detected on the page, displays a subtle glowing dot on the squircle corner to notify the user.

### B. Streamlined Download Sheet ("Save Video")
- **Header & Title**: Displays the actual detected media title or clean active page title. If no video is active, displays a clean prompt to browse or paste a media link, without fake dummy labels.
- **Format Selection**: Clean, unboxed format rows with standard tabular file size and resolution metadata, omitting artificial badges or pill chips.
- **Primary CTA**: Prominent, full-width "Start Download" action button pinned to the sheet base.

---

## 3. Technical Architecture & Component Flow

```
┌────────────────────────────────────────────────────────┐
│                   App Screen Viewport                  │
│                                                        │
│  [Top Bar / Tabs / Omnibox]                            │
│                                                        │
│  [Main Browsing / Webview Content Area]                │
│                                    ┌──────────────┐    │
│                                    │  [↓] Squircle│    │
│                                    │  56×56, r=16 │    │
│                                    │  (Top: 50%)  │    │
│                                    └──────┬───────┘    │
│                                           │ Click      │
│  [Bottom Audio / Transfer Bar]            ▼            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ "Save Video" Modal Sheet                         │  │
│  │ - Actual detected video title (no fake text)     │  │
│  │ - Real format list with filesize/codec           │  │
│  │ - [Start Download] action                        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Key State & Handler Mappings
- `s.sheet`: Controlled by clicking the right-edge squircle button.
- `s.detectedVideo`: Source of truth for media title and formats; removes hardcoded `'Mountain Road Timelapse'` fallback.
- `this.startDownload()`: Triggers download queue and transitions progress indicator.

---

## 4. Verification & Testing Steps

1. **Visual & Geometric Verification**:
   - Inspect floating button dimensions (`56×56 px`, `16px` border-radius) and position (`right: 24px`, `top: 50%`).
   - Verify it does not collide with bottom playing bars or top navigation controls across all screen sizes.
2. **Sheet Content Verification**:
   - Open the sheet with no video detected: verify no "Mountain Road Timelapse" placeholder or fake chips appear.
   - Open the sheet with detected media: verify real title and formats appear cleanly.
3. **Compilation & Linting**:
   - Run `compile_applet` and `lint_applet` to confirm clean build with zero warnings or errors.
