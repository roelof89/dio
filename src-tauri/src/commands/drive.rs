use std::path::PathBuf;

use tauri::State;

use crate::{
    db::{self, models::DataSource},
    error::{DioError, Result},
    prefs::{self, Prefs},
    scanner,
    state::AppState,
};

#[tauri::command]
pub async fn connect_drive(
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<DataSource> {
    let drive_root = PathBuf::from(&path);

    if !drive_root.exists() {
        return Err(DioError::Other(format!("Path does not exist: {path}")));
    }

    let pool = db::open_or_create(&drive_root).await?;

    // Upsert the data_source record for this drive
    let name = drive_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Drive")
        .to_string();

    sqlx::query("INSERT OR IGNORE INTO data_source (name, path) VALUES (?, ?)")
        .bind(&name)
        .bind(&path)
        .execute(&pool)
        .await?;

    let ds = sqlx::query_as::<_, DataSource>("SELECT * FROM data_source WHERE path = ?")
        .bind(&path)
        .fetch_one(&pool)
        .await?;

    // Discover entity dirs before storing pool (pool is still owned here)
    scanner::discover_entities(&drive_root, &pool).await?;

    // Store pool and path in app state (lock briefly, never across an await)
    {
        let mut guard = state.db.lock().unwrap();
        *guard = Some(pool);
    }
    {
        let mut guard = state.drive_path.lock().unwrap();
        *guard = Some(drive_root);
    }

    let _ = prefs::save(&app, &Prefs { last_drive_path: Some(path) });

    Ok(ds)
}

/// Re-run entity discovery on the currently connected drive.
/// Called by the Discover (refresh) button in the UI.
#[tauri::command]
pub async fn discover(state: State<'_, AppState>) -> Result<usize> {
    let pool = state.get_pool()?;
    let drive_root = {
        let guard = state.drive_path.lock().unwrap();
        guard.clone().ok_or(DioError::NoDriveConnected)?
    };
    scanner::discover_entities(&drive_root, &pool).await
}

#[tauri::command]
pub async fn get_data_source(state: State<'_, AppState>) -> Result<Option<DataSource>> {
    let pool = match state.get_pool() {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };
    let ds = sqlx::query_as::<_, DataSource>("SELECT * FROM data_source LIMIT 1")
        .fetch_optional(&pool)
        .await?;
    Ok(ds)
}

#[tauri::command]
pub async fn disconnect_drive(state: State<'_, AppState>) -> Result<()> {
    let maybe_pool = {
        let mut guard = state.db.lock().unwrap();
        guard.take()
    };
    if let Some(pool) = maybe_pool {
        pool.close().await;
    }
    let mut guard = state.drive_path.lock().unwrap();
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn get_last_drive_path(app: tauri::AppHandle) -> Option<String> {
    prefs::load(&app).last_drive_path
}
