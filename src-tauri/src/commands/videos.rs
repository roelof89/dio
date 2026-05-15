use tauri::State;

use crate::{
    db::models::{Category, Entity, Video},
    error::{DioError, Result},
    state::AppState,
};

#[tauri::command]
pub async fn get_videos(entity_id: i64, state: State<'_, AppState>) -> Result<Vec<Video>> {
    let pool = state.get_pool()?;
    // Include videos physically in this entity AND videos linked here via video_link
    let videos = sqlx::query_as::<_, Video>(
        "SELECT * FROM videos \
         WHERE entity_id = ? \
            OR id IN (SELECT video_id FROM video_link WHERE entity_id = ?) \
         ORDER BY file_created_at DESC",
    )
    .bind(entity_id)
    .bind(entity_id)
    .fetch_all(&pool)
    .await?;
    Ok(videos)
}

#[tauri::command]
pub async fn update_video_rating(
    video_id: i64,
    rating: i64,
    state: State<'_, AppState>,
) -> Result<()> {
    let pool = state.get_pool()?;
    sqlx::query("UPDATE videos SET rating = ? WHERE id = ?")
        .bind(rating)
        .bind(video_id)
        .execute(&pool)
        .await?;
    Ok(())
}

/// Physically move a video file to a different entity directory and update
/// all database references.
#[tauri::command]
pub async fn move_video_to_entity(
    video_id: i64,
    target_entity_id: i64,
    state: State<'_, AppState>,
) -> Result<Video> {
    let pool = state.get_pool()?;

    let video = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
        .bind(video_id)
        .fetch_one(&pool)
        .await?;

    let target = sqlx::query_as::<_, Entity>("SELECT * FROM entity WHERE id = ?")
        .bind(target_entity_id)
        .fetch_one(&pool)
        .await?;

    let current = std::path::PathBuf::from(&video.file_path);
    let file_name = current
        .file_name()
        .ok_or_else(|| DioError::Other("Invalid file path".into()))?;
    let new_path = std::path::Path::new(&target.dir_path).join(file_name);

    if new_path.exists() {
        return Err(DioError::Other(format!(
            "'{}' already exists in '{}'",
            file_name.to_string_lossy(),
            target.name
        )));
    }

    tokio::fs::rename(&video.file_path, &new_path).await?;

    let new_path_str = new_path.to_string_lossy().to_string();
    sqlx::query("UPDATE videos SET entity_id = ?, file_path = ? WHERE id = ?")
        .bind(target_entity_id)
        .bind(&new_path_str)
        .bind(video_id)
        .execute(&pool)
        .await?;

    // Remove any video_link pointing to the new primary entity
    sqlx::query("DELETE FROM video_link WHERE video_id = ? AND entity_id = ?")
        .bind(video_id)
        .bind(target_entity_id)
        .execute(&pool)
        .await?;

    let updated = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
        .bind(video_id)
        .fetch_one(&pool)
        .await?;
    Ok(updated)
}

/// Return the categories assigned to a specific video.
#[tauri::command]
pub async fn get_video_categories(
    video_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<Category>> {
    let pool = state.get_pool()?;
    let cats = sqlx::query_as::<_, Category>(
        "SELECT c.* FROM categories c \
         JOIN category_link cl ON c.id = cl.category_id \
         WHERE cl.video_id = ? ORDER BY c.name",
    )
    .bind(video_id)
    .fetch_all(&pool)
    .await?;
    Ok(cats)
}

/// Fetch videos with optional entity and category filters.
/// - entity_id only: all videos in that entity
/// - category_ids only: all videos across all entities that have those categories
/// - both: intersection — entity videos that also have those categories
#[tauri::command]
pub async fn get_videos_filtered(
    entity_id: Option<i64>,
    category_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<Video>> {
    let pool = state.get_pool()?;

    if category_ids.is_empty() {
        return match entity_id {
            Some(eid) => Ok(
                sqlx::query_as::<_, Video>(
                    "SELECT * FROM videos \
                     WHERE entity_id = ? \
                        OR id IN (SELECT video_id FROM video_link WHERE entity_id = ?) \
                     ORDER BY file_created_at DESC",
                )
                .bind(eid)
                .bind(eid)
                .fetch_all(&pool)
                .await?,
            ),
            None => Ok(vec![]),
        };
    }

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT DISTINCT v.* FROM videos v \
         JOIN category_link cl ON v.id = cl.video_id WHERE ",
    );

    if let Some(eid) = entity_id {
        // Include both primary entity videos and video_link'd videos
        qb.push("(v.entity_id = ");
        qb.push_bind(eid);
        qb.push(" OR v.id IN (SELECT video_id FROM video_link WHERE entity_id = ");
        qb.push_bind(eid);
        qb.push(")) AND ");
    }

    qb.push("cl.category_id IN (");
    let mut sep = qb.separated(", ");
    for id in &category_ids {
        sep.push_bind(*id);
    }
    qb.push(") ORDER BY v.file_created_at DESC");

    let videos = qb.build_query_as::<Video>().fetch_all(&pool).await?;
    Ok(videos)
}

/// Read a thumbnail file and return it as a base64 data URI so the frontend
/// does not need the asset protocol to display local images.
#[tauri::command]
pub async fn get_thumbnail(path: String) -> Result<String> {
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| DioError::Other(e.to_string()))?;
    use base64::prelude::*;
    Ok(format!("data:image/jpeg;base64,{}", BASE64_STANDARD.encode(&bytes)))
}

/// Search videos by matching query words against file names, entity names,
/// and category names. Returns a flat, deduplicated list capped at 200.
#[tauri::command]
pub async fn search_videos(query: String, state: State<'_, AppState>) -> Result<Vec<Video>> {
    let pool = state.get_pool()?;

    let words: Vec<String> = query
        .split_whitespace()
        .filter(|w| w.len() >= 2)
        .map(|w| format!("%{w}%"))
        .collect();

    if words.is_empty() {
        return Ok(vec![]);
    }

    let mut qb = sqlx::QueryBuilder::new(
        "SELECT DISTINCT v.* FROM videos v \
         JOIN entity e ON v.entity_id = e.id \
         WHERE (",
    );

    // file_name matches
    for (i, w) in words.iter().enumerate() {
        if i > 0 { qb.push(" OR "); }
        qb.push("v.file_name LIKE ");
        qb.push_bind(w.clone());
    }

    // entity name matches
    qb.push(") OR (");
    for (i, w) in words.iter().enumerate() {
        if i > 0 { qb.push(" OR "); }
        qb.push("e.name LIKE ");
        qb.push_bind(w.clone());
    }

    // category name matches
    qb.push(") OR v.id IN (SELECT cl.video_id FROM category_link cl \
             JOIN categories c ON cl.category_id = c.id WHERE ");
    for (i, w) in words.iter().enumerate() {
        if i > 0 { qb.push(" OR "); }
        qb.push("c.name LIKE ");
        qb.push_bind(w.clone());
    }

    qb.push(") ORDER BY v.file_created_at DESC LIMIT 200");

    let videos = qb.build_query_as::<Video>().fetch_all(&pool).await?;
    Ok(videos)
}

/// Link a video to another entity without moving the file.
/// The video still lives in its original entity but appears in the target too.
#[tauri::command]
pub async fn link_video_to_entity(
    video_id: i64,
    target_entity_id: i64,
    state: State<'_, AppState>,
) -> Result<()> {
    let pool = state.get_pool()?;

    // Don't link to the entity the video already lives in
    let video = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
        .bind(video_id)
        .fetch_one(&pool)
        .await?;
    if video.entity_id == target_entity_id {
        return Err(DioError::Other("Video already belongs to this entity".into()));
    }

    sqlx::query("INSERT OR IGNORE INTO video_link (video_id, entity_id) VALUES (?, ?)")
        .bind(video_id)
        .bind(target_entity_id)
        .execute(&pool)
        .await?;

    Ok(())
}

/// Rename a video file on disk and update DB references.
#[tauri::command]
pub async fn rename_video(
    video_id: i64,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<Video> {
    let pool = state.get_pool()?;

    let video = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
        .bind(video_id)
        .fetch_one(&pool)
        .await?;

    let old_path = std::path::PathBuf::from(&video.file_path);
    let ext = old_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err(DioError::Other("Name cannot be empty".into()));
    }

    let new_file_name = if ext.is_empty() {
        trimmed.to_string()
    } else {
        format!("{trimmed}.{ext}")
    };

    let new_path = old_path.with_file_name(&new_file_name);

    if new_path == old_path {
        // Nothing changed
        return Ok(video);
    }
    if new_path.exists() {
        return Err(DioError::Other(format!(
            "'{}' already exists in this directory",
            new_file_name
        )));
    }

    tokio::fs::rename(&old_path, &new_path).await?;

    let new_path_str = new_path.to_string_lossy().to_string();
    sqlx::query("UPDATE videos SET file_name = ?, file_path = ? WHERE id = ?")
        .bind(&new_file_name)
        .bind(&new_path_str)
        .bind(video_id)
        .execute(&pool)
        .await?;

    let updated = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
        .bind(video_id)
        .fetch_one(&pool)
        .await?;
    Ok(updated)
}

/// Delete a video from disk and the database.
#[tauri::command]
pub async fn delete_video(video_id: i64, state: State<'_, AppState>) -> Result<()> {
    let pool = state.get_pool()?;

    let video = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
        .bind(video_id)
        .fetch_one(&pool)
        .await?;

    tokio::fs::remove_file(&video.file_path).await?;

    if let Some(thumb) = &video.thumbnail_path {
        let _ = tokio::fs::remove_file(thumb).await;
    }

    // Cascade handles category_link, video_link, playlist_video
    sqlx::query("DELETE FROM videos WHERE id = ?")
        .bind(video_id)
        .execute(&pool)
        .await?;

    Ok(())
}
