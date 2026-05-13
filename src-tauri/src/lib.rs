mod commands;
mod db;
mod error;
mod prefs;
mod scanner;
mod state;
mod video;
mod watcher;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // drive
            commands::drive::connect_drive,
            commands::drive::get_data_source,
            commands::drive::disconnect_drive,
            commands::drive::get_last_drive_path,
            commands::drive::discover,
            // entities
            commands::entities::get_entities,
            commands::entities::create_entity,
            // videos
            commands::videos::get_videos,
            commands::videos::update_video_rating,
            commands::videos::move_video_to_entity,
            commands::videos::get_video_categories,
            commands::videos::get_videos_filtered,
            commands::videos::get_thumbnail,
            commands::videos::delete_video,
            // categories
            commands::categories::get_categories,
            commands::categories::create_category,
            commands::categories::delete_category,
            commands::categories::add_video_category,
            commands::categories::remove_video_category,
            // duplicates
            commands::duplicates::find_duplicates,
            commands::duplicates::resolve_duplicate,
            // playback
            commands::playback::play_file,
            commands::playback::play_queue,
            // scan
            commands::scan::scan_entity,
            commands::scan::scan_all,
            // playlists
            commands::playlists::get_playlists,
            commands::playlists::create_playlist,
            commands::playlists::delete_playlist,
            commands::playlists::add_to_playlist,
            commands::playlists::remove_from_playlist,
            commands::playlists::get_playlist_videos,
            commands::playlists::save_queue_as_playlist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
