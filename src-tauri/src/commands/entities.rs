use tauri::State;

use crate::{
    db::models::Entity,
    error::{DioError, Result},
    state::AppState,
};

#[tauri::command]
pub async fn get_entities(state: State<'_, AppState>) -> Result<Vec<Entity>> {
    let pool = state.get_pool()?;
    let entities = sqlx::query_as::<_, Entity>(
"SELECT * FROM entity ORDER BY is_unsorted DESC, name COLLATE NOCASE ASC",
    )
    .fetch_all(&pool)
    .await?;
    Ok(entities)
}

#[tauri::command]
pub async fn create_entity(name: String, state: State<'_, AppState>) -> Result<Entity> {
    let pool = state.get_pool()?;

    let drive_path = {
        let guard = state.drive_path.lock().unwrap();
        guard
            .clone()
            .ok_or(DioError::NoDriveConnected)?
    };

    let dir_name = name.replace(' ', "_");
    let dir_path = drive_path.join("entity").join(&dir_name);
    tokio::fs::create_dir_all(&dir_path).await?;

    let dir_path_str = dir_path.to_string_lossy().to_string();

    let ds_id: i64 = sqlx::query_scalar("SELECT id FROM data_source LIMIT 1")
        .fetch_one(&pool)
        .await?;

    sqlx::query(
        "INSERT OR IGNORE INTO entity (data_source_id, dir_name, name, dir_path, is_unsorted) \
         VALUES (?, ?, ?, ?, 0)",
    )
    .bind(ds_id)
    .bind(&dir_name)
    .bind(&name)
    .bind(&dir_path_str)
    .execute(&pool)
    .await?;

    let entity = sqlx::query_as::<_, Entity>("SELECT * FROM entity WHERE dir_path = ?")
        .bind(&dir_path_str)
        .fetch_one(&pool)
        .await?;

    Ok(entity)
}
