use tauri::State;

use crate::{
    db::models::Category,
    error::Result,
    state::AppState,
};

#[tauri::command]
pub async fn get_categories(state: State<'_, AppState>) -> Result<Vec<Category>> {
    let pool = state.get_pool()?;
    let cats = sqlx::query_as::<_, Category>("SELECT * FROM categories ORDER BY name ASC")
        .fetch_all(&pool)
        .await?;
    Ok(cats)
}

#[tauri::command]
pub async fn create_category(
    name: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<Category> {
    let pool = state.get_pool()?;
    sqlx::query("INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)")
        .bind(&name)
        .bind(&description)
        .execute(&pool)
        .await?;
    let cat = sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE name = ?")
        .bind(&name)
        .fetch_one(&pool)
        .await?;
    Ok(cat)
}

#[tauri::command]
pub async fn add_video_category(
    video_id: i64,
    category_id: i64,
    state: State<'_, AppState>,
) -> Result<()> {
    let pool = state.get_pool()?;
    sqlx::query(
        "INSERT OR IGNORE INTO category_link (video_id, category_id) VALUES (?, ?)",
    )
    .bind(video_id)
    .bind(category_id)
    .execute(&pool)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn remove_video_category(
    video_id: i64,
    category_id: i64,
    state: State<'_, AppState>,
) -> Result<()> {
    let pool = state.get_pool()?;
    sqlx::query("DELETE FROM category_link WHERE video_id = ? AND category_id = ?")
        .bind(video_id)
        .bind(category_id)
        .execute(&pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_category(category_id: i64, state: State<'_, AppState>) -> Result<()> {
    let pool = state.get_pool()?;
    sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(category_id)
        .execute(&pool)
        .await?;
    Ok(())
}
