use std::path::Path;
use tokio::process::Command;

// Resolve ffmpeg/ffprobe from common macOS install paths
fn bin(name: &str) -> String {
    for candidate in &[
        format!("/opt/homebrew/bin/{name}"),
        format!("/usr/local/bin/{name}"),
        name.to_string(),
    ] {
        if Path::new(candidate.as_str()).exists() {
            return candidate.clone();
        }
    }
    name.to_string()
}

// ── Metadata ─────────────────────────────────────────────────────────────────

pub struct VideoMeta {
    pub duration: Option<f64>,
    pub codec: Option<String>,
    pub file_type: Option<String>,
    pub file_size: Option<i64>,
}

/// Run ffprobe on a file and extract duration, codec, and size.
/// Returns a best-effort result even on partial failures.
pub async fn probe(file_path: &Path) -> VideoMeta {
    let file_type = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()));

    let file_size = std::fs::metadata(file_path).ok().map(|m| m.len() as i64);

    let Ok(output) = Command::new(bin("ffprobe"))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            file_path.to_str().unwrap_or(""),
        ])
        .output()
        .await
    else {
        return VideoMeta { duration: None, codec: None, file_type, file_size };
    };

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .unwrap_or(serde_json::Value::Null);

    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok());

    let codec = json["streams"]
        .as_array()
        .and_then(|streams| streams.iter().find(|s| s["codec_type"] == "video"))
        .and_then(|s| s["codec_name"].as_str())
        .map(|s| s.to_string());

    VideoMeta { duration, codec, file_type, file_size }
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

/// Generate a JPEG thumbnail at `seek_secs` into the video.
/// Falls back to 0 s if the seek position is past the end.
/// Failures are silenced — a missing thumbnail is non-fatal.
pub async fn generate_thumbnail(file_path: &Path, output_path: &Path, seek_secs: u32) {
    if let Some(parent) = output_path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    for seek in [seek_secs.to_string(), "0".to_string()] {
        let Ok(out) = Command::new(bin("ffmpeg"))
            .args([
                "-y",
                "-ss",
                &seek,
                "-i",
                file_path.to_str().unwrap_or(""),
                "-vframes",
                "1",
                "-vf",
                "scale=320:-1",
                "-q:v",
                "5",
                output_path.to_str().unwrap_or(""),
            ])
            .output()
            .await
        else {
            continue;
        };

        if out.status.success() && output_path.exists() {
            return;
        }
    }
}

// ── Perceptual fingerprint ────────────────────────────────────────────────────

/// Sample 5 frames spread across the video and compute a dHash for each.
/// Returns a dash-separated hex string, e.g. `"a1b2c3..."-"d4e5f6..."`.
/// Returns `None` if no frames could be extracted.
pub async fn compute_fingerprint(file_path: &Path, duration_secs: f64) -> Option<String> {
    // Pick sample points at 10 %, 30 %, 50 %, 70 %, 90 % of duration
    let points: Vec<f64> = if duration_secs <= 5.0 {
        vec![0.0]
    } else {
        let step = duration_secs / 6.0;
        (1..=5).map(|i| step * i as f64).collect()
    };

    let mut hashes: Vec<String> = Vec::new();
    for t in points {
        if let Some(h) = frame_dhash(file_path, t).await {
            hashes.push(format!("{h:016x}"));
        }
    }

    if hashes.is_empty() {
        None
    } else {
        Some(hashes.join("-"))
    }
}

/// Extract one frame at `seek_secs` and compute its 64-bit dHash.
async fn frame_dhash(file_path: &Path, seek_secs: f64) -> Option<u64> {
    let output = Command::new(bin("ffmpeg"))
        .args([
            "-ss",
            &format!("{seek_secs:.2}"),
            "-i",
            file_path.to_str()?,
            "-vframes",
            "1",
            "-f",
            "image2",
            "-vcodec",
            "png",
            "pipe:1",
        ])
        .output()
        .await
        .ok()?;

    if output.stdout.is_empty() {
        return None;
    }

    // Image decoding is CPU-bound — run on a blocking thread
    let bytes = output.stdout;
    tokio::task::spawn_blocking(move || {
        let img = image::load_from_memory(&bytes).ok()?;
        Some(dhash(&img))
    })
    .await
    .ok()?
}

/// Difference hash (dHash): resize to 9×8, compare adjacent pixels per row.
fn dhash(img: &image::DynamicImage) -> u64 {
    use image::imageops::FilterType;
    let small = img
        .resize_exact(9, 8, FilterType::Lanczos3)
        .to_luma8();

    let mut hash: u64 = 0;
    for row in 0..8u32 {
        for col in 0..8u32 {
            let left = small.get_pixel(col, row).0[0];
            let right = small.get_pixel(col + 1, row).0[0];
            hash = (hash << 1) | u64::from(left < right);
        }
    }
    hash
}
