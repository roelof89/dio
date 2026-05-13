use tauri_plugin_opener::OpenerExt;

use crate::error::{DioError, Result};

/// Open a single video file in the system default player.
#[tauri::command]
pub fn play_file(path: String, app: tauri::AppHandle) -> Result<()> {
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| DioError::Other(e.to_string()))
}

/// Open multiple video files at once using macOS `open`.
/// Sends all paths to the default app — VLC/IINA will queue them,
/// QuickTime will open separate windows.
#[tauri::command]
pub async fn play_queue(paths: Vec<String>) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }
    std::process::Command::new("open")
        .args(&paths)
        .spawn()
        .map_err(|e| DioError::Other(format!("Failed to open player: {e}")))?;
    Ok(())
}
