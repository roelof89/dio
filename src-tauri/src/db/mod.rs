pub mod models;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode},
    SqlitePool,
};
use std::path::Path;

use crate::error::Result;

/// Open (or create) the Dio database inside `{drive_root}/.dio/`.
/// Runs all pending migrations automatically.
pub async fn open_or_create(drive_root: &Path) -> Result<SqlitePool> {
    let dio_dir = drive_root.join(".dio");
    tokio::fs::create_dir_all(&dio_dir).await?;

    let db_path = dio_dir.join("dio.db");

    let opts = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePool::connect_with(opts).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
