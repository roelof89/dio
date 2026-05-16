# Dio

A media management tool for external hard drives. Dio lets you organise, categorise, deduplicate, and play video collections stored on external drives. The database lives on the drive itself so your entire index travels with it between machines — connect on your laptop, continue on your desktop.

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Frontend | React 19 + TypeScript + Vite |
| Backend | Rust (async via Tokio) |
| Database | SQLite via `sqlx` with WAL mode |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Drag-and-drop | @dnd-kit |
| Media processing | system `ffmpeg` / `ffprobe` |

## Features

### Drive & entity management
- Connect to any directory (`/Volumes/...` for external drives) — auto-reconnects on next launch
- Entity-based folder organisation; each entity is a real directory on the drive
- `unsorted` entity auto-created for unclassified content
- Create entities from the sidebar; folders are created on disk immediately
- Discover button (↺) syncs new/deleted folders — adding a folder in Finder appears after one click; deleting an empty folder removes it
- Resizable three-pane layout (sidebar · grid · play tray)

### Scanning & metadata
- Scan All or per-entity scan via `ffprobe` — extracts duration, codec, file size, file type
- Thumbnail generated at 5 s into each video (falls back to 0 s for short clips)
- Perceptual fingerprint (dHash sampled at 5 points across the video) stored for each video
- Scanning is incremental — already-processed files are skipped on re-scan
- Progress shown in the toolbar during scan

### Video grid
- Lazy-loaded thumbnails via IntersectionObserver — only fetches when scrolling into view
- Sort by: Date Created, Date Modified, Date Added, File Size, Duration, Rating, Name — with asc/desc toggle
- Star rating filter — click a star in the header to show only videos rated N+ stars
- 1–5 star rating per video (click to set, click again to clear)
- **⌘+A** to select all, **⌘+click** to toggle selection, **Shift+click** for range selection
- Click empty space to deselect (file-explorer behaviour)
- Click a thumbnail to open the in-app player
- Drag videos (single or multi-selected) into the play tray
- Right-click a single video → rename, move to entity, link to entity, manage categories, delete
- Right-click a multi-selection → add to play tray, bulk move, bulk add/remove category, bulk delete
- Smart context menu positioning — opens upward when near the bottom of the screen; entity/category lists scroll within viewport
- Add-to-queue button (+) on hover adds to the play tray

### Search
- Global search across video file names, entity names, and category names
- Split-word matching — each word is matched independently (e.g. "john muscle" finds JohnBronco entity + videos tagged "muscle")
- Debounced input (300ms) with results capped at 200
- Search bar in the toolbar with clear button

### In-app video player
- Full-screen overlay player backed by the HTML5 `<video>` element
- Auto-advances to the next video in the queue when playback ends
- Dot indicator for queue position; Previous / Next buttons
- Header and controls transparent by default, visible on hover (no dimming while watching)
- Keyboard: `Esc` to close, `←`/`→` to seek ±10s, `F` for fullscreen

### Categories
- Create and delete categories from the sidebar
- Tag videos individually (right-click → Categories) or in bulk
- Click a category in the sidebar to filter the grid across all entities
- Combine entity + category filters for an intersection view
- Category filter badge shown in the grid header

### Play tray & playlists
- Drag videos from the grid into the play tray (single or multi-select)
- Drag-and-drop reordering within the tray via @dnd-kit
- Save the current queue as a named playlist
- Load saved playlists back into the tray
- Play All opens the in-app player starting at position 0

### Duplicate detection
- Two-pass detection:
  - **Pass 1**: exact fingerprint match (catches re-encodes with different names/sizes)
  - **Pass 2**: file size + rounded duration grouping with fingerprint similarity scoring
- Confidence levels: **exact** (same filename), **likely** (fingerprint match), **possible**
- Smart suggestion: entity copy wins over unsorted; unsorted copy is deleted with no link created
- Cross-entity duplicates: one physical file is kept; the other entity is linked via `video_link` so the video appears in both sidebars
- Review UI: per-set approval (click to change which copy to keep) or Approve All
- Grid refreshes automatically when the review modal closes

## Database location

The database and thumbnails are stored on the connected drive:

```
{drive_root}/.dio/dio.db        ← SQLite database (WAL mode)
{drive_root}/.dio/thumbnails/   ← JPEG thumbnails named by video ID
```

App preferences (last-connected drive path) are stored locally at:
```
~/Library/Application Support/dev.dio.app/prefs.json
```

## Data model

| Table | Purpose |
|---|---|
| `data_source` | Connected drive record |
| `entity` | Folder/entity directories on the drive (includes `unsorted`) |
| `videos` | One row per physical file — path, size, duration, codec, fingerprint, thumbnail, rating |
| `video_link` | Cross-entity membership (video lives in entity A, also visible in entity B) |
| `categories` / `category_link` | User-created tags, many-to-many with videos |
| `playlist` / `playlist_video` | Ordered playlists |

## Build status

- **Phase 1** ✅ — Tauri scaffold, Rust backend layout, SQLite migrations
- **Phase 2** ✅ — Drive connection, entity discovery, prefs auto-reconnect
- **Phase 3** ✅ — Video scanning, ffprobe metadata, thumbnails, fingerprinting
- **Phase 4** ✅ — Three-pane UI shell: sidebar, thumbnail grid, play tray
- **Phase 5** ✅ — Entity moves, categories, ratings, playlists, in-app player
- **Phase 6** ✅ — Duplicate detection and staged review workflow
- **Phase 7** ✅ — Background file watcher (FSEvents + 2s debounce), scan-now banner
- **Phase 8** ✅ — Search, sort/filter controls, rename, link to entity, drag-to-tray, lazy thumbnails, improved dedup, dark title bar, custom app icon

## Dev setup

Prerequisites: Rust, Node ≥ 18, npm, `ffmpeg` (Homebrew: `brew install ffmpeg`).

```sh
npm install
npm run tauri dev
```

To build a release binary:

```sh
npm run tauri build
```
