-- Connected drive
CREATE TABLE IF NOT EXISTS data_source (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    path        TEXT    NOT NULL UNIQUE,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Entity folders on the drive (including 'unsorted')
CREATE TABLE IF NOT EXISTS entity (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    data_source_id  INTEGER NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
    dir_name        TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    dir_path        TEXT    NOT NULL UNIQUE,
    is_unsorted     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entity_data_source ON entity(data_source_id);

-- One row per physical video file
CREATE TABLE IF NOT EXISTS videos (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id        INTEGER NOT NULL REFERENCES entity(id) ON DELETE RESTRICT,
    file_name        TEXT    NOT NULL,
    file_path        TEXT    NOT NULL UNIQUE,
    file_size        INTEGER,
    duration         REAL,
    codec            TEXT,
    file_type        TEXT,
    fingerprint      TEXT,
    thumbnail_path   TEXT,
    rating           INTEGER NOT NULL DEFAULT 0,
    file_created_at  TEXT,
    file_modified_at TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    processed        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_videos_entity      ON videos(entity_id);
CREATE INDEX IF NOT EXISTS idx_videos_fingerprint ON videos(fingerprint);
CREATE INDEX IF NOT EXISTS idx_videos_file_size   ON videos(file_size);
CREATE INDEX IF NOT EXISTS idx_videos_created     ON videos(file_created_at DESC);

-- Additional entity membership for a video (many-to-many)
CREATE TABLE IF NOT EXISTS video_link (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id  INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    entity_id INTEGER NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
    UNIQUE(video_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_video_link_video  ON video_link(video_id);
CREATE INDEX IF NOT EXISTS idx_video_link_entity ON video_link(entity_id);

-- User-created categories
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Video <-> category (many-to-many)
CREATE TABLE IF NOT EXISTS category_link (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id    INTEGER NOT NULL REFERENCES videos(id)      ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id)  ON DELETE CASCADE,
    UNIQUE(video_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_category_link_video    ON category_link(video_id);
CREATE INDEX IF NOT EXISTS idx_category_link_category ON category_link(category_id);

-- Playlists
CREATE TABLE IF NOT EXISTS playlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Ordered playlist entries
CREATE TABLE IF NOT EXISTS playlist_video (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES playlist(id) ON DELETE CASCADE,
    video_id    INTEGER NOT NULL REFERENCES videos(id)   ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    UNIQUE(playlist_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_video_playlist ON playlist_video(playlist_id);
