use wasm_bindgen::prelude::*;

/// Smoothstep crossfade curve: eased in and out with no abrupt start/end.
#[wasm_bindgen]
pub fn smooth_crossfade(position: f64) -> f64 {
    let x = position.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

/// Apply a compact preset transform to RGBA pixels.
/// Preset IDs: 1 cinema, 2 vivid, 3 monochrome, 4 noir,
/// 5 dream, 6 warm, 7 cool, 8 invert.
#[wasm_bindgen]
pub fn apply_filter_rgba(pixels: &mut [u8], preset: u8) {
    for px in pixels.chunks_exact_mut(4) {
        let r = px[0] as f32;
        let g = px[1] as f32;
        let b = px[2] as f32;
        let clamp = |v: f32| v.clamp(0.0, 255.0) as u8;
        match preset {
            1 => {
                px[0] = clamp(r * 0.90 + 12.0);
                px[1] = clamp(g * 0.88 + 8.0);
                px[2] = clamp(b * 0.82 + 5.0);
            }
            2 => {
                px[0] = clamp((r - 128.0) * 1.16 + 128.0);
                px[1] = clamp((g - 128.0) * 1.16 + 128.0);
                px[2] = clamp((b - 128.0) * 1.16 + 128.0);
            }
            3 | 4 => {
                let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                let value = if preset == 4 { (y - 128.0) * 1.55 + 128.0 } else { y };
                let gray = clamp(value);
                px[0] = gray; px[1] = gray; px[2] = gray;
            }
            5 => {
                px[0] = clamp(r * 1.08 + 12.0);
                px[1] = clamp(g * 1.08 + 12.0);
                px[2] = clamp(b * 1.08 + 12.0);
            }
            6 => {
                px[0] = clamp(r * 1.08 + 18.0);
                px[1] = clamp(g * 1.02 + 5.0);
                px[2] = clamp(b * 0.88);
            }
            7 => {
                px[0] = clamp(r * 0.90);
                px[2] = clamp(b * 1.12 + 8.0);
            }
            8 => {
                px[0] = 255 - px[0];
                px[1] = 255 - px[1];
                px[2] = 255 - px[2];
            }
            _ => {}
        }
    }
}
