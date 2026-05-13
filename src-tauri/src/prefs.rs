use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

use crate::error::{DioError, Result};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Prefs {
    pub last_drive_path: Option<String>,
}

fn prefs_path(app: &tauri::AppHandle) -> Result<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| DioError::Other(e.to_string()))?;
    Ok(data_dir.join("prefs.json"))
}

pub fn load(app: &tauri::AppHandle) -> Prefs {
    if let Ok(path) = prefs_path(app) {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(prefs) = serde_json::from_str(&content) {
                return prefs;
            }
        }
    }
    Prefs::default()
}

pub fn save(app: &tauri::AppHandle, prefs: &Prefs) -> Result<()> {
    let path = prefs_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content =
        serde_json::to_string_pretty(prefs).map_err(|e| DioError::Other(e.to_string()))?;
    std::fs::write(&path, content)?;
    Ok(())
}
