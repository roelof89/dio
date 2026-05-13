use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct DataSource {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Entity {
    pub id: i64,
    pub data_source_id: i64,
    pub dir_name: String,
    pub name: String,
    pub dir_path: String,
    pub is_unsorted: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Video {
    pub id: i64,
    pub entity_id: i64,
    pub file_name: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub duration: Option<f64>,
    pub codec: Option<String>,
    pub file_type: Option<String>,
    pub fingerprint: Option<String>,
    pub thumbnail_path: Option<String>,
    pub rating: i64,
    pub file_created_at: Option<String>,
    pub file_modified_at: Option<String>,
    pub created_at: String,
    pub processed: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct PlaylistVideo {
    pub id: i64,
    pub playlist_id: i64,
    pub video_id: i64,
    pub position: i64,
}
