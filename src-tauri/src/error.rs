use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum DioError {
    #[error("Database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("Migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("No drive connected")]
    NoDriveConnected,

    #[error("{0}")]
    Other(String),
}

// Tauri commands require serializable errors
impl Serialize for DioError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, DioError>;
