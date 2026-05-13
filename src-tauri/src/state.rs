use sqlx::SqlitePool;
use std::{path::PathBuf, sync::Mutex};

use crate::error::{DioError, Result};

pub struct AppState {
    pub db: Mutex<Option<SqlitePool>>,
    pub drive_path: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: Mutex::new(None),
            drive_path: Mutex::new(None),
        }
    }

    /// Clone the pool out of the mutex so callers never hold the lock across awaits.
    pub fn get_pool(&self) -> Result<SqlitePool> {
        let guard = self.db.lock().unwrap();
        guard
            .as_ref()
            .ok_or(DioError::NoDriveConnected)
            .map(|p| p.clone())
    }
}
