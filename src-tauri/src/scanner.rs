use std::path::Path;

use sqlx::SqlitePool;
use tauri::Emitter;

use crate::error::Result;

/// Ensure `{drive_root}/entity/` and `{drive_root}/entity/unsorted` exist, then
/// walk top-level subdirectories and upsert entity rows in the DB.
/// Returns the number of newly inserted entities.
pub async fn discover_entities(drive_root: &Path, pool: &SqlitePool) -> Result<usize> {
    let entity_root = drive_root.join("entity");
    tokio::fs::create_dir_all(&entity_root).await?;

    // Always ensure unsorted exists
    let unsorted_path = entity_root.join("unsorted");
    tokio::fs::create_dir_all(&unsorted_path).await?;

    let ds_id: i64 = sqlx::query_scalar("SELECT id FROM data_source LIMIT 1")
        .fetch_one(pool)
        .await?;

    let mut new_count = 0usize;
    let mut dir = tokio::fs::read_dir(&entity_root).await?;

    while let Some(entry) = dir.next_entry().await? {
        // Only process directories; skip hidden entries like .DS_Store
        let file_type = entry.file_type().await?;
        if !file_type.is_dir() {
            continue;
        }

        let dir_name = match entry.file_name().to_str() {
            Some(n) if !n.starts_with('.') => n.to_string(),
            _ => continue,
        };

        let is_unsorted = dir_name == "unsorted";
        // Pretty-print: underscores → spaces
        let pretty_name = dir_name.replace('_', " ");
        let dir_path = entry.path().to_string_lossy().to_string();

        let result = sqlx::query(
            "INSERT OR IGNORE INTO entity \
             (data_source_id, dir_name, name, dir_path, is_unsorted) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(ds_id)
        .bind(&dir_name)
        .bind(&pretty_name)
        .bind(&dir_path)
        .bind(is_unsorted as i64)
        .execute(pool)
        .await?;

        if result.rows_affected() > 0 {
            new_count += 1;
        }
    }

    // Prune entity records whose directory no longer exists on disk.
    // Silently skips entities that still have videos (ON DELETE RESTRICT).
    let existing = sqlx::query_as::<_, crate::db::models::Entity>("SELECT * FROM entity")
        .fetch_all(pool)
        .await?;
    for entity in existing {
        if !std::path::Path::new(&entity.dir_path).exists() {
            let _ = sqlx::query("DELETE FROM entity WHERE id = ?")
                .bind(entity.id)
                .execute(pool)
                .await;
        }
    }

    Ok(new_count)
}

const VIDEO_EXTS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg",
    "3gp", "ts", "m2ts", "mts",
];

/// Walk an entity directory, register new video files, extract metadata,
/// generate thumbnails, and compute perceptual fingerprints.
/// Emits `scan_progress` events via the app handle.
pub async fn scan_entity(
    entity_id: i64,
    pool: &SqlitePool,
    dio_dir: &std::path::Path,
    app: &tauri::AppHandle,
) -> Result<usize> {
    let entity = sqlx::query_as::<_, crate::db::models::Entity>(
        "SELECT * FROM entity WHERE id = ?",
    )
    .bind(entity_id)
    .fetch_one(pool)
    .await?;

    let thumb_dir = dio_dir.join("thumbnails");
    tokio::fs::create_dir_all(&thumb_dir).await?;

    // Collect video file paths first (walkdir is sync)
    let entity_dir = std::path::PathBuf::from(&entity.dir_path);
    let video_paths: Vec<std::path::PathBuf> = walkdir::WalkDir::new(&entity_dir)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && !e.file_name().to_string_lossy().starts_with(".")
                && e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|ext| VIDEO_EXTS.contains(&ext.to_lowercase().as_str()))
                    .unwrap_or(false)
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    let mut count = 0usize;

    for file_path in video_paths {
        let file_path_str = file_path.to_string_lossy().to_string();

        // Skip files already in the database
        let already_exists: bool =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM videos WHERE file_path = ?")
                .bind(&file_path_str)
                .fetch_one(pool)
                .await
                .map(|n| n > 0)
                .unwrap_or(false);

        if already_exists {
            continue;
        }

        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let fs_meta = match std::fs::metadata(&file_path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let file_size = fs_meta.len() as i64;
        let file_created_at = system_time_str(fs_meta.created().ok());
        let file_modified_at = system_time_str(fs_meta.modified().ok());

        // Insert stub row to obtain the auto-assigned ID
        let video_id: i64 = sqlx::query_scalar(
            "INSERT INTO videos \
             (entity_id, file_name, file_path, file_size, file_created_at, file_modified_at) \
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        )
        .bind(entity_id)
        .bind(&file_name)
        .bind(&file_path_str)
        .bind(file_size)
        .bind(&file_created_at)
        .bind(&file_modified_at)
        .fetch_one(pool)
        .await?;

        // Probe with ffprobe
        let meta = crate::video::probe(&file_path).await;

        // Generate thumbnail
        let thumb_path = thumb_dir.join(format!("{video_id}.jpg"));
        crate::video::generate_thumbnail(&file_path, &thumb_path, 5).await;
        let thumb_path_opt = thumb_path.exists().then(|| thumb_path.to_string_lossy().into_owned());

        // Compute perceptual fingerprint (skipped for very short clips)
        let fingerprint = if let Some(dur) = meta.duration.filter(|&d| d > 1.0) {
            crate::video::compute_fingerprint(&file_path, dur).await
        } else {
            None
        };

        // Update the row with all extracted data
        sqlx::query(
            "UPDATE videos \
             SET duration = ?, codec = ?, file_type = ?, \
                 fingerprint = ?, thumbnail_path = ?, processed = 1 \
             WHERE id = ?",
        )
        .bind(meta.duration)
        .bind(&meta.codec)
        .bind(&meta.file_type)
        .bind(&fingerprint)
        .bind(&thumb_path_opt)
        .bind(video_id)
        .execute(pool)
        .await?;

        count += 1;

        let _ = app.emit(
            "scan_progress",
            serde_json::json!({ "entity_id": entity_id, "file_name": file_name, "count": count }),
        );
    }

    Ok(count)
}

fn system_time_str(t: Option<std::time::SystemTime>) -> Option<String> {
    let dur = t?.duration_since(std::time::UNIX_EPOCH).ok()?;
    let dt = chrono::DateTime::from_timestamp(dur.as_secs() as i64, 0)?;
    Some(dt.format("%Y-%m-%d %H:%M:%S").to_string())
}
