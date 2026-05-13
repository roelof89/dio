use std::path::Path;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

const VIDEO_EXTS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg",
    "3gp", "ts", "m2ts", "mts",
];

/// Watch `entity_root` for new video files.
/// Returns the watcher handle — dropping it stops watching.
/// Emits `"files_changed"` to the frontend after a 2-second quiet period.
pub fn start(entity_root: &Path, app: AppHandle) -> notify::Result<RecommendedWatcher> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<()>();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            // Only react to file creation events for video file types
            if matches!(event.kind, notify::EventKind::Create(_)) {
                let has_video = event.paths.iter().any(|p| {
                    p.extension()
                        .and_then(|e| e.to_str())
                        .map(|ext| VIDEO_EXTS.contains(&ext.to_lowercase().as_str()))
                        .unwrap_or(false)
                });
                if has_video {
                    let _ = tx.send(());
                }
            }
        }
    })?;

    watcher.watch(entity_root, RecursiveMode::Recursive)?;

    // Debounce: wait for 2 s of silence after the last event, then notify the UI.
    // This prevents a flood of events when copying many files at once.
    tokio::spawn(async move {
        let debounce = tokio::time::Duration::from_secs(2);
        loop {
            // Block until at least one event arrives
            if rx.recv().await.is_none() {
                break; // sender dropped — drive disconnected
            }
            // Drain any additional events that arrive within the debounce window
            loop {
                match tokio::time::timeout(debounce, rx.recv()).await {
                    Ok(Some(())) => {} // another event — reset the window
                    _ => break,        // timeout or channel closed
                }
            }
            // Quiet period elapsed — tell the UI
            let _ = app.emit("files_changed", ());
        }
    });

    Ok(watcher)
}
