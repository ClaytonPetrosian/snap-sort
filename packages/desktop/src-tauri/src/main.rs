/**
 * SnapSort Desktop — Tauri backend
 *
 * Provides Tauri commands for:
 * - CLIP ONNX model loading and inference
 * - Image preprocessing (resize, normalize, CHW conversion)
 * - File system scanning for photos
 *
 * Architecture:
 * - JS frontend calls Tauri invoke() commands
 * - Rust backend handles ONNX inference via `ort` crate
 * - Image processing via `image` crate
 */

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;

use image::imageops::FilterType;
use image::io::Reader as ImageReader;
use image::GenericImageView;
use ort::{inputs, session::Session, value::TensorRef};
use serde::{Deserialize, Serialize};
use tauri::State;

// ImageNet normalization constants (same as CLIP Python preprocessing)
const IMAGENET_MEAN: [f32; 3] = [0.481_454_66, 0.457_827_5, 0.408_210_73];
const IMAGENET_STD: [f32; 3] = [0.268_629_54, 0.261_302_58, 0.275_777_11];
const IMAGE_SIZE: u32 = 224;

/// Shared state holding the ONNX session
struct ClipState {
    session: Mutex<Option<Session>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ModelInfo {
    path: String,
    loaded: bool,
}

#[derive(Debug, Serialize)]
struct EmbeddingResult {
    embedding: Vec<f32>,
    dimension: usize,
}

#[derive(Debug, Serialize)]
struct BatchEmbeddingResult {
    embeddings: Vec<Vec<f32>>,
    count: usize,
    errors: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ScanResult {
    files: Vec<String>,
    count: usize,
}

/// Initialize the CLIP model from an ONNX file path.
#[tauri::command]
async fn init_clip_model(
    state: State<'_, ClipState>,
    model_path: String,
) -> Result<ModelInfo, String> {
    let path = PathBuf::from(&model_path);
    if !path.exists() {
        return Err(format!("Model file not found: {}", model_path));
    }

    let session = Session::builder()
        .map_err(|e| format!("Failed to create session builder: {}", e))?
        .commit_from_file(&path)
        .map_err(|e| format!("Failed to load model from {}: {}", model_path, e))?;

    let mut guard = state.session.lock().map_err(|e| format!("Lock error: {}", e))?;
    *guard = Some(session);

    Ok(ModelInfo {
        path: model_path,
        loaded: true,
    })
}

/// Get CLIP embedding for a single image.
#[tauri::command]
async fn get_image_embedding(
    state: State<'_, ClipState>,
    file_path: String,
) -> Result<EmbeddingResult, String> {
    let preprocessed = preprocess_image(&file_path)?;

    let mut guard = state.session.lock().map_err(|e| format!("Lock error: {}", e))?;
    let session = guard.as_mut().ok_or("Model not initialized. Call init_clip_model first.")?;

    let input_tensor = TensorRef::from_array_view(preprocessed.as_slice())
        .map_err(|e| format!("Failed to create tensor: {}", e))?;

    let outputs = session
        .run(inputs![input_tensor])
        .map_err(|e| format!("Inference failed: {}", e))?;

    let output = outputs
        .get("image_embeds")
        .or_else(|| outputs.values().next())
        .ok_or("No output tensor found")?;

    let embedding_vec: Vec<f32> = output
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Failed to extract output: {}", e))?
        .1
        .to_vec();

    // L2 normalize
    let normalized = l2_normalize(&embedding_vec);

    Ok(EmbeddingResult {
        dimension: normalized.len(),
        embedding: normalized,
    })
}

/// Batch get CLIP embeddings for multiple images.
#[tauri::command]
async fn get_image_embeddings_batch(
    state: State<'_, ClipState>,
    file_paths: Vec<String>,
) -> Result<BatchEmbeddingResult, String> {
    let mut embeddings = Vec::with_capacity(file_paths.len());
    let mut errors = Vec::new();

    for path in &file_paths {
        match get_image_embedding_inner(&state, path).await {
            Ok(emb) => embeddings.push(emb),
            Err(e) => errors.push(format!("{}: {}", path, e)),
        }
    }

    Ok(BatchEmbeddingResult {
        count: embeddings.len(),
        embeddings,
        errors,
    })
}

/// Scan a directory for image files.
#[tauri::command]
async fn scan_directory(dir_path: String) -> Result<ScanResult, String> {
    let path = PathBuf::from(&dir_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let extensions = ["jpg", "jpeg", "png", "webp", "heic", "heif", "bmp", "gif"];
    let mut files = Vec::new();

    scan_recursive(&path, &extensions, &mut files, 10_000);
    files.sort();

    Ok(ScanResult {
        count: files.len(),
        files,
    })
}

/// Check if the ONNX runtime is available.
#[tauri::command]
fn check_ort_available() -> Result<String, String> {
    Ok(format!("snap-sort-desktop v{}", env!("CARGO_PKG_VERSION")))
}

/// Get model status.
#[tauri::command]
fn get_model_status(state: State<'_, ClipState>) -> Result<bool, String> {
    let guard = state.session.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(guard.is_some())
}

// --- Internal helpers ---

async fn get_image_embedding_inner(
    state: &State<'_, ClipState>,
    file_path: &str,
) -> Result<Vec<f32>, String> {
    let preprocessed = preprocess_image(file_path)?;

    let mut guard = state.session.lock().map_err(|e| format!("Lock error: {}", e))?;
    let session = guard.as_mut().ok_or("Model not initialized")?;

    let input_tensor = TensorRef::from_array_view(preprocessed.as_slice())
        .map_err(|e| format!("Tensor error: {}", e))?;

    let outputs = session
        .run(inputs![input_tensor])
        .map_err(|e| format!("Inference error: {}", e))?;

    let output = outputs
        .get("image_embeds")
        .or_else(|| outputs.values().next())
        .ok_or("No output")?;

    let raw: Vec<f32> = output
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Extract error: {}", e))?
        .1
        .to_vec();

    Ok(l2_normalize(&raw))
}

/// Preprocess image to CLIP input format: resize to 224x224, center-crop,
/// normalize with ImageNet mean/std, convert to CHW Float32Array.
fn preprocess_image(file_path: &str) -> Result<Vec<f32>, String> {
    let img = ImageReader::open(file_path)
        .map_err(|e| format!("Failed to open image {}: {}", file_path, e))?
        .decode()
        .map_err(|e| format!("Failed to decode image {}: {}", file_path, e))?;

    // Resize shortest side to IMAGE_SIZE, then center-crop
    let (w, h) = img.dimensions();
    let shorter = w.min(h);
    let scale = IMAGE_SIZE as f32 / shorter as f32;
    let new_w = (w as f32 * scale).round() as u32;
    let new_h = (h as f32 * scale).round() as u32;

    let resized = img.resize_exact(new_w, new_h, FilterType::CatmullRom);
    let (rw, rh) = resized.dimensions();

    // Center crop to IMAGE_SIZE x IMAGE_SIZE
    let crop_x = (rw.saturating_sub(IMAGE_SIZE)) / 2;
    let crop_y = (rh.saturating_sub(IMAGE_SIZE)) / 2;
    let cropped = resized.crop_imm(crop_x, crop_y, IMAGE_SIZE, IMAGE_SIZE);

    // Convert to RGB and extract raw pixels
    let rgb_img = cropped.to_rgb8();
    let raw_pixels = rgb_img.as_raw();

    // Convert HWC uint8 to CHW float32 with ImageNet normalization
    let mut chw = vec![0.0f32; 3 * (IMAGE_SIZE as usize) * (IMAGE_SIZE as usize)];

    for y in 0..IMAGE_SIZE as usize {
        for x in 0..IMAGE_SIZE as usize {
            let hwc_idx = (y * IMAGE_SIZE as usize + x) * 3;
            let pixel_idx = y * IMAGE_SIZE as usize + x;

            for c in 0..3 {
                let pixel = raw_pixels[hwc_idx + c] as f32 / 255.0;
                let normalized = (pixel - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
                chw[c * IMAGE_SIZE as usize * IMAGE_SIZE as usize + pixel_idx] = normalized;
            }
        }
    }

    Ok(chw)
}

fn l2_normalize(vector: &[f32]) -> Vec<f32> {
    let norm: f32 = vector.iter().map(|v| v * v).sum::<f32>().sqrt();
    if norm == 0.0 {
        return vector.to_vec();
    }
    vector.iter().map(|v| v / norm).collect()
}

fn scan_recursive(dir: &PathBuf, extensions: &[&str], results: &mut Vec<String>, max: usize) {
    if results.len() >= max {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if results.len() >= max {
            break;
        }

        let path = entry.path();
        if path.is_dir() {
            // Skip hidden directories
            if let Some(name) = path.file_name() {
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
            }
            scan_recursive(&path, extensions, results, max);
        } else if let Some(ext) = path.extension() {
            let ext_lower = ext.to_string_lossy().to_lowercase();
            if extensions.contains(&ext_lower.as_str()) {
                results.push(path.to_string_lossy().to_string());
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ClipState {
            session: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            init_clip_model,
            get_image_embedding,
            get_image_embeddings_batch,
            scan_directory,
            check_ort_available,
            get_model_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
