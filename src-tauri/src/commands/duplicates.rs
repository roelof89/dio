use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{db::models::Video, error::Result, state::AppState};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DuplicateVideo {
    #[serde(flatten)]
    pub video: Video,
    pub entity_name: String,
    pub entity_is_unsorted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateSet {
    pub videos: Vec<DuplicateVideo>,
    pub confidence: String, // "exact" | "likely" | "possible"
    pub suggested_keep_id: Option<i64>,
    pub suggested_action: String, // "delete_unsorted" | "link_entities"
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Scan all processed videos and return groups of likely duplicates.
#[tauri::command]
pub async fn find_duplicates(state: State<'_, AppState>) -> Result<Vec<DuplicateSet>> {
    let pool = state.get_pool()?;

    // Load all processed videos
    let videos = sqlx::query_as::<_, Video>(
        "SELECT * FROM videos WHERE processed = 1",
    )
    .fetch_all(&pool)
    .await?;

    // Build entity lookup
    let entities = sqlx::query_as::<_, crate::db::models::Entity>("SELECT * FROM entity")
        .fetch_all(&pool)
        .await?;
    let entity_map: HashMap<i64, (String, bool)> = entities
        .into_iter()
        .map(|e| (e.id, (e.name, e.is_unsorted)))
        .collect();

    let to_dup = |video: &Video| -> DuplicateVideo {
        let (entity_name, entity_is_unsorted) = entity_map
            .get(&video.entity_id)
            .cloned()
            .unwrap_or_else(|| ("Unknown".into(), false));
        DuplicateVideo { video: video.clone(), entity_name, entity_is_unsorted }
    };

    let mut sets: Vec<DuplicateSet> = Vec::new();
    let mut seen_ids: HashSet<i64> = HashSet::new();

    // ── Pass 1: exact fingerprint matches ─────────────────────────────────
    let mut fp_groups: HashMap<String, Vec<DuplicateVideo>> = HashMap::new();
    for video in &videos {
        if let Some(fp) = &video.fingerprint {
            if !fp.is_empty() {
                fp_groups.entry(fp.clone()).or_default().push(to_dup(video));
            }
        }
    }
    for (_fp, group) in fp_groups {
        if group.len() < 2 { continue; }
        // Mark these video IDs so pass 2 doesn't duplicate them
        for v in &group { seen_ids.insert(v.video.id); }
        sets.push(build_set(group, "likely"));
    }

    // ── Pass 2: same file_size + rounded duration (skip already-matched) ──
    let mut size_groups: HashMap<(i64, i64), Vec<DuplicateVideo>> = HashMap::new();
    for video in &videos {
        if seen_ids.contains(&video.id) { continue; }
        if let (Some(size), Some(dur)) = (video.file_size, video.duration) {
            size_groups
                .entry((size, dur.round() as i64))
                .or_default()
                .push(to_dup(video));
        }
    }
    for (_key, group) in size_groups {
        if group.len() < 2 { continue; }

        let same_name = group.windows(2).all(|w| w[0].video.file_name == w[1].video.file_name);
        let confidence = if same_name {
            "exact"
        } else {
            let fp_sim = group[0]
                .video
                .fingerprint
                .as_deref()
                .zip(group[1].video.fingerprint.as_deref())
                .map(|(a, b)| fingerprint_similarity(a, b))
                .unwrap_or(0.0);
            if fp_sim > 0.82 { "likely" } else { "possible" }
        };
        sets.push(build_set(group, confidence));
    }

    // Sort: exact first, then likely, then possible
    sets.sort_by(|a, b| {
        let rank = |c: &str| match c { "exact" => 0, "likely" => 1, _ => 2 };
        rank(&a.confidence).cmp(&rank(&b.confidence))
    });

    Ok(sets)
}

/// Resolve a duplicate set: keep one video, delete the rest from disk and DB.
/// If a deleted copy lived in a different entity, that entity is linked to the
/// kept video via the video_link table so it still appears there.
#[tauri::command]
pub async fn resolve_duplicate(
    keep_id: i64,
    delete_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<()> {
    let pool = state.get_pool()?;

    let keep_video = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
        .bind(keep_id)
        .fetch_one(&pool)
        .await?;

    for del_id in &delete_ids {
        let video = sqlx::query_as::<_, Video>("SELECT * FROM videos WHERE id = ?")
            .bind(del_id)
            .fetch_one(&pool)
            .await?;

        // Only link if the deleted copy lived in a REAL entity (not unsorted).
        // Linking back to unsorted would be meaningless — the unsorted copy was junk.
        if video.entity_id != keep_video.entity_id {
            let del_entity =
                sqlx::query_as::<_, crate::db::models::Entity>("SELECT * FROM entity WHERE id = ?")
                    .bind(video.entity_id)
                    .fetch_optional(&pool)
                    .await?;

            if del_entity.map(|e| !e.is_unsorted).unwrap_or(false) {
                sqlx::query(
                    "INSERT OR IGNORE INTO video_link (video_id, entity_id) VALUES (?, ?)",
                )
                .bind(keep_id)
                .bind(video.entity_id)
                .execute(&pool)
                .await?;
            }
        }

        // Delete the physical file (non-fatal)
        let _ = tokio::fs::remove_file(&video.file_path).await;
        if let Some(thumb) = &video.thumbnail_path {
            let _ = tokio::fs::remove_file(thumb).await;
        }

        // Remove from DB (cascade handles category_link, video_link, playlist_video)
        sqlx::query("DELETE FROM videos WHERE id = ?")
            .bind(del_id)
            .execute(&pool)
            .await?;
    }

    // Clean up any video_link rows that incorrectly point to unsorted entities
    // (can happen from earlier runs before this fix)
    sqlx::query(
        "DELETE FROM video_link \
         WHERE entity_id IN (SELECT id FROM entity WHERE is_unsorted = 1)",
    )
    .execute(&pool)
    .await?;

    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn build_set(group: Vec<DuplicateVideo>, confidence: &str) -> DuplicateSet {
    let has_entity = group.iter().any(|v| !v.entity_is_unsorted);
    let has_unsorted = group.iter().any(|v| v.entity_is_unsorted);

    let (suggested_keep_id, suggested_action) = if has_entity && has_unsorted {
        let keep = group.iter().find(|v| !v.entity_is_unsorted).map(|v| v.video.id);
        (keep, "delete_unsorted")
    } else {
        let keep = group.iter().min_by_key(|v| v.video.id).map(|v| v.video.id);
        (keep, "link_entities")
    };

    DuplicateSet {
        videos: group,
        confidence: confidence.into(),
        suggested_keep_id,
        suggested_action: suggested_action.into(),
    }
}

/// Compute the similarity
/// Each fingerprint is dash-separated 16-char hex values.
fn fingerprint_similarity(fp1: &str, fp2: &str) -> f64 {
    let parse = |s: &str| -> Vec<u64> {
        s.split('-')
            .filter_map(|h| u64::from_str_radix(h, 16).ok())
            .collect()
    };
    let h1 = parse(fp1);
    let h2 = parse(fp2);
    if h1.is_empty() || h2.is_empty() {
        return 0.0;
    }
    let n = h1.len().min(h2.len());
    let matching: u32 = h1.iter().zip(h2.iter()).map(|(a, b)| 64 - (a ^ b).count_ones()).sum();
    matching as f64 / (64.0 * n as f64)
}
