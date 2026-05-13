# Dio

A media management tool for external hard drives. Dio lets you organise, categorise, deduplicate, and play video collections stored on external drives — and because the database lives on the drive itself, your entire index travels with it between machines.

## Tech stack

- **Desktop shell**: Tauri v2
- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust
- **Database**: SQLite via `sqlx` (lives on the drive at `{drive}/.dio/dio.db`)
- **Media processing**: system `ffmpeg` / `ffprobe` for metadata, thumbnails, and fingerprinting

## Features

- Connect to an external drive (`/Volumes/...`) — database and thumbnails live on the drive so the index moves with it
- Entity-based folder organisation — each entity is a real directory on the drive
- `unsorted` entity for new or unclassified downloads, auto-detected when new files appear
- Video metadata: duration, codec, file size, rating (1–5 stars)
- Thumbnail generated at 5 seconds into the video
- Perceptual fingerprinting for duplicate detection across different filenames
- Duplicate review workflow — per-set or approve-all, with smart rules for unsorted vs entity copies
- Category management with many-to-many video links
- Play tray with drag-and-drop ordering and playlist save/load
- Background file watcher + manual Discover button for new content

## Database location

The database and thumbnails are stored on the connected drive:

```
{drive_root}/.dio/dio.db
{drive_root}/.dio/thumbnails/
```

App preferences (last-connected drive path) are stored locally at `~/Library/Application Support/dev.dio.app/prefs.json`.

## Data model

- `data_source` — connected drive record
- `entity` — folder/entity directories on the drive (includes `unsorted`)
- `videos` — one row per physical video file; stores path, size, duration, codec, fingerprint, thumbnail path, rating
- `video_link` — many-to-many, videos linked to additional entities
- `categories` / `category_link` — user-created categories linked to videos
- `playlist` / `playlist_video` — ordered playlists

## Build phases

- **Phase 1** — Tauri scaffold, Rust backend layout, SQLite migrations ✅ (scaffold done)
- **Phase 2** — Drive connection, entity discovery, DB-backed reads
- **Phase 3** — Video scanning, ffprobe metadata, thumbnail generation
- **Phase 4** — Three-pane UI shell: sidebar, thumbnail grid, play tray
- **Phase 5** — Entity moves, categories, ratings, playlists
- **Phase 6** — Duplicate detection and review workflow
- **Phase 7** — File watcher, discover controls, progress indicators, polish

## Dev setup

Prerequisites: Rust, Node, npm, `ffmpeg` (via Homebrew).

```sh
npm install
npm run tauri dev
```
