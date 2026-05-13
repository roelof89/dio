use tauri::State;

use crate::{
    db::models::Entity,
    error::{DioError, Result},
    scanner,
    state::AppState,
};

#[tauri::command]
pub async fn scan_entity(
    entity_id: i64,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<usize> {
    let pool = state.get_pool()?;
    let drive_path = {
        let guard = state.drive_path.lock().unwrap();
        guard.clone().ok_or(DioError::NoDriveConnected)?
    };
    let dio_dir = drive_path.join(".dio");
    scanner::scan_entity(entity_id, &pool, &dio_dir, &app).await
}

#[tauri::command]
pub async fn scan_all(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<usize> {
    let pool = state.get_pool()?;
    let drive_path = {
        let guard = state.drive_path.lock().unwrap();
        guard.clone().ok_or(DioError::NoDriveConnected)?
    };
    let dio_dir = drive_path.join(".dio");

    let entities = sqlx::query_as::<_, Entity>("SELECT * FROM entity ORDER BY is_unsorted DESC")
        .fetch_all(&pool)
        .await?;

    let mut total = 0usize;
    for entity in entities {
        total += scanner::scan_entity(entity.id, &pool, &dio_dir, &app).await?;
    }
    Ok(total)
}
