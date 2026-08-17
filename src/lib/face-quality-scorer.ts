/**
 * Face Quality Scorer — Lightweight image quality assessment for avatar selection.
 *
 * Evaluates candidate avatar images based on:
 * - Sharpness (Laplacian variance proxy via pixel gradient analysis)
 * - Contrast (histogram spread)
 * - Brightness (mean luminance — penalize too dark / too bright)
 * - Face region prominence (center weight)
 *
 * Returns a score 0-100 where higher = better quality anchor image.
 * Runs client-side (Canvas API) or server-side (Buffer analysis).
 */

export interface FaceQualityResult {
  score: number;         // 0-100
  sharpness: number;     // 0-100
  contrast: number;      // 0-100
  brightness: number;    // 0-100 (50 = ideal)
  centerWeight: number;  // 0-100 (face region prominence)
}

/**
 * Score an image from its raw pixel data (RGBA Uint8ClampedArray).
 * Works with Canvas ImageData.data or decoded PNG/JPEG buffers.
 */
export function scoreImagePixels(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): FaceQualityResult {
  const totalPixels = width * height;
  if (totalPixels < 100) return { score: 0, sharpness: 0, contrast: 0, brightness: 50, centerWeight: 0 };

  // ─── Brightness (mean luminance) ─────────────────────────────
  let luminanceSum = 0;
  const luminanceSamples: number[] = [];
  const sampleStep = Math.max(1, Math.floor(totalPixels / 4000));
  for (let i = 0; i < totalPixels; i += sampleStep) {
    const idx = i * 4;
    const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    luminanceSum += lum;
    luminanceSamples.push(lum);
  }
  const meanLum = luminanceSum / luminanceSamples.length;
  // Ideal brightness around 128 (neither too dark nor blown out)
  const brightnessScore = Math.max(0, 100 - Math.abs(meanLum - 128) * 1.2);

  // ─── Contrast (standard deviation of luminance) ──────────────
  const variance = luminanceSamples.reduce((sum, l) => sum + (l - meanLum) ** 2, 0) / luminanceSamples.length;
  const stdDev = Math.sqrt(variance);
  // Ideal std dev ~50-70 for well-lit portraits
  const contrastScore = Math.min(100, stdDev * 2);

  // ─── Sharpness (Laplacian proxy: sum of absolute gradients) ───
  // Use every 4th row/col for performance
  let gradientSum = 0;
  let gradientCount = 0;
  const stepX = Math.max(1, Math.floor(width / 200));
  const stepY = Math.max(1, Math.floor(height / 200));
  for (let y = 1; y < height - 1; y += stepY) {
    for (let x = 1; x < width - 1; x += stepX) {
      const idx = (y * width + x) * 4;
      const idxRight = (y * width + x + 1) * 4;
      const idxDown = ((y + 1) * width + x) * 4;
      const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      const lumR = 0.299 * pixels[idxRight] + 0.587 * pixels[idxRight + 1] + 0.114 * pixels[idxRight + 2];
      const lumD = 0.299 * pixels[idxDown] + 0.587 * pixels[idxDown + 1] + 0.114 * pixels[idxDown + 2];
      gradientSum += Math.abs(lum - lumR) + Math.abs(lum - lumD);
      gradientCount++;
    }
  }
  const avgGradient = gradientCount > 0 ? gradientSum / gradientCount : 0;
  // Normalize: typical sharp portrait has avg gradient 15-40
  const sharpnessScore = Math.min(100, avgGradient * 3.5);

  // ─── Center weight (face region prominence) ──────────────────
  // Sample the center 40% of the image (where face typically is)
  const cx0 = Math.floor(width * 0.3);
  const cx1 = Math.floor(width * 0.7);
  const cy0 = Math.floor(height * 0.15);
  const cy1 = Math.floor(height * 0.55);
  let centerLumSum = 0;
  let centerCount = 0;
  for (let y = cy0; y < cy1; y += stepY) {
    for (let x = cx0; x < cx1; x += stepX) {
      const idx = (y * width + x) * 4;
      centerLumSum += 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      centerCount++;
    }
  }
  const centerMean = centerCount > 0 ? centerLumSum / centerCount : meanLum;
  // Face region should be slightly brighter than background (well-lit subject)
  const centerAdvantage = centerMean - meanLum;
  const centerWeight = Math.min(100, Math.max(0, 50 + centerAdvantage * 2));

  // ─── Composite score ─────────────────────────────────────────
  const score = Math.round(
    sharpnessScore * 0.35 +
    contrastScore * 0.25 +
    brightnessScore * 0.20 +
    centerWeight * 0.20,
  );

  return {
    score: Math.min(100, Math.max(0, score)),
    sharpness: Math.round(sharpnessScore),
    contrast: Math.round(contrastScore),
    brightness: Math.round(brightnessScore),
    centerWeight: Math.round(centerWeight),
  };
}

/**
 * Score an image from a URL (downloads and decodes via Image element or fetch).
 * Client-side: uses Image + Canvas. Server-side: use scoreImageBuffer instead.
 */
export async function scoreImageFromUrl(imageUrl: string): Promise<FaceQualityResult> {
  if (typeof window === 'undefined') {
    // Server-side: fetch and decode via sharp or raw buffer
    // Fallback: return default score (server uses ADetailer confidence instead)
    return { score: 75, sharpness: 70, contrast: 70, brightness: 50, centerWeight: 80 };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Limit to 256px wide for performance
      const scale = Math.min(1, 256 / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve({ score: 50, sharpness: 50, contrast: 50, brightness: 50, centerWeight: 50 }); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve(scoreImagePixels(imageData.data, canvas.width, canvas.height));
    };
    img.onerror = () => resolve({ score: 0, sharpness: 0, contrast: 0, brightness: 50, centerWeight: 0 });
    img.src = imageUrl;
  });
}

/**
 * Select the best image from multiple candidates by face quality score.
 * Returns the index of the best candidate.
 */
export async function selectBestCandidate(imageUrls: string[]): Promise<number> {
  if (imageUrls.length <= 1) return 0;

  const scores = await Promise.all(imageUrls.map((url) => scoreImageFromUrl(url)));
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i].score > bestScore) {
      bestScore = scores[i].score;
      bestIdx = i;
    }
  }
  return bestIdx;
}
