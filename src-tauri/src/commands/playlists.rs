use tauri::State;

use crate::{
    db::models::Playlist,
    error::Result,
    state::AppState,
};

#[tauri::command]
pub async fn get_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>> {
    let pool = state.get_pool()?;
    let playlists =
        sqlx::query_as::<_, Playlist>("SELECT * FROM playlist ORDER BY created_at DESC")
            .fetch_all(&pool)
            .await?;
    Ok(playlists)
}

#[tauri::command]
pub async fn create_playlist(
    name: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<Playlist> {
    let pool = state.get_pool()?;
    let id: i64 =
        sqlx::query_scalar("INSERT INTO playlist (name, description) VALUES (?, ?) RETURNING id")
            .bind(&name)
            .bind(&description)
            .fetch_one(&pool)
            .await?;
    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlist WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await?;
    Ok(playlist)
}

#[tauri::command]
pub async fn add_to_playlist(
    playlist_id: i64,
    video_id: i64,
    state: State<'_, AppState>,
) -> Result<()> {
    let pool = state.get_pool()?;
    let max_pos: Option<i64> =
        sqlx::query_scalar("SELECT MAX(position) FROM playlist_video WHERE playlist_id = ?")
            .bind(playlist_id)
            .fetch_one(&pool)
            .await?;
    let next_pos = max_pos.unwrap_or(-1) + 1;
    sqlx::query(
        "INSERT OR IGNORE INTO playlist_video (playlist_id, video_id, position) VALUES (?, ?, ?)",
    )
    .bind(playlist_id)
    .bind(video_id)
    .bind(next_pos)
    .execute(&pool)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn remove_from_playlist(
    playlist_id: i64,
    video_id: i64,
    state: State<'_, AppState>,
) -> Result<()> {
    let pool = state.get_pool()?;
    sqlx::query("DELETE FROM playlist_video WHERE playlist_id = ? AND video_id = ?")
        .bind(playlist_id)
        .bind(video_id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_playlist_videos(
    playlist_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::models::Video>> {
    let pool = state.get_pool()?;
    let videos = sqlx::query_as::<_, crate::db::models::Video>(
        "SELECT v.* FROM videos v \
         JOIN playlist_video pv ON v.id = pv.video_id \
         WHERE pv.playlist_id = ? ORDER BY pv.position ASC",
    )
    .bind(playlist_id)
    .fetch_all(&pool)
    .await?;
    Ok(videos)
}

#[tauri::command]
pub async fn save_queue_as_playlist(
    name: String,
    video_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<Playlist> {
    let pool = state.get_pool()?;
    let id: i64 = sqlx::query_scalar("INSERT INTO playlist (name) VALUES (?) RETURNING id")
        .bind(&name)
        .fetch_one(&pool)
        .await?;
    for (pos, vid_id) in video_ids.iter().enumerate() {
        sqlx::query(
            "INSERT INTO playlist_video (playlist_id, video_id, position) VALUES (?, ?, ?)",
        )
        .bind(id)
        .bind(vid_id)
        .bind(pos as i64)
        .execute(&pool)
        .await?;
    }
    let playlist = sqlx::query_as::<_, Playlist>("SELECT * FROM playlist WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await?;
    Ok(playlist)
}

#[tauri::command]
pub async fn delete_playlist(playlist_id: i64, state: State<'_, AppState>) -> Result<()> {
    let pool = state.get_pool()?;
    sqlx::query("DELETE FROM playlist WHERE id = ?")
        .bind(playlist_id)
        .execute(&pool)
        .await?;
    Ok(())
}
