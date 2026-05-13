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
- Thumbnails sorted newest-first; shows duration and file size
- 1–5 star rating per video (click to set, click again to clear)
- **⌘+click** to toggle selection, **Shift+click** for range selection
- Click empty space to deselect (file-explorer behaviour)
- Click a thumbnail to open the in-app player
- Right-click a single video → move to entity, manage categories, delete
- Right-click a multi-selection → bulk move, bulk add/remove category, bulk delete
- Add-to-queue button (hover) adds to the play tray

### In-app video player
- Full-screen overlay player backed by the HTML5 `<video>` element
- Auto-advances to the next video in the queue when playback ends
- Dot indicator for queue position; Previous / Next buttons
- Keyboard: `Esc` to close, `←`/`→` to skip

### Categories
- Create and delete categories from the sidebar
- Tag videos individually (right-click → Categories) or in bulk
- Click a category in the sidebar to filter the grid across all entities
- Combine entity + category filters for an intersection view
- Category filter badge shown in the grid header

### Play tray & playlists
- Drag-and-drop reordering via @dnd-kit
- Save the current queue as a named playlist
- Load saved playlists back into the tray
- Play All opens the in-app player starting at position 0

### Duplicate detection
- Staged detection: file size + duration (±1 s) → fingerprint similarity
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
