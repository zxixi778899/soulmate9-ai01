/**
 * Shot Scale & Camera Angle Prompts for FLUX
 * 
 * This module provides natural language prompts for camera composition
 * that work well with FLUX's natural language understanding.
 */

export type ShotScale = 'extreme-close-up' | 'close-up' | 'medium-close-up' | 'medium' | 'full-body' | 'wide' | 'extreme-wide';
export type CameraAngle = 'eye-level' | 'low-angle' | 'high-angle' | 'bird\'s-eye';

/**
 * Shot scale descriptions - FLUX-friendly natural language
 * Each includes framing instructions and what should be visible
 */
export const SHOT_SCALES: Record<ShotScale, string> = {
  'extreme-close-up': 'Extreme close-up shot focusing only on the face, filling the entire frame, intimate portrait',
  'close-up': 'Close-up shot from chest up, face clearly visible and dominant in frame, shoulders included',
  'medium-close-up': 'Medium close-up shot from waist up, head and upper body visible, natural composition',
  'medium': 'Medium shot from hips up, full upper body visible, room for body language and gestures',
  'full-body': 'Full-body shot capturing the entire person from head to toe, both feet completely visible, no cropping',
  'wide': 'Wide shot showing full body with environment context, person occupies ~60% of frame',
  'extreme-wide': 'Extreme wide shot establishing the scene, person is small within the environment, environmental portrait',
};

/**
 * Camera angle descriptions - FLUX-friendly natural language
 * Each includes perspective and viewer relationship
 */
export const CAMERA_ANGLES: Record<CameraAngle, string> = {
  'eye-level': 'Eye-level camera angle, straight-on perspective, natural viewing angle at subject\'s face level',
  'low-angle': 'Low-angle shot looking up at subject from below, subject appears powerful and dominant, camera pointed upward',
  'high-angle': 'High-angle shot looking down at subject from above, camera angled downward toward subject',
  'bird\'s-eye': 'Bird\'s-eye view directly overhead looking down, top-down perspective, complete overhead view',
};

/**
 * Composite composition prompt combining shot scale + camera angle
 * Use these directly in FLUX prompts for precise camera control
 */
export function buildCompositionPrompt(
  shotScale: ShotScale,
  cameraAngle: CameraAngle,
): string {
  const scaleDesc = SHOT_SCALES[shotScale];
  const angleDesc = CAMERA_ANGLES[cameraAngle];
  
  return `${scaleDesc}. ${angleDesc}. Natural composition, professional photography`;
}

/**
 * Preset compositions for common use cases
 */
export const COMPOSITION_PRESETS: Record<string, { shotScale: ShotScale; cameraAngle: CameraAngle }> = {
  'portrait': { shotScale: 'close-up', cameraAngle: 'eye-level' },
  'headshot': { shotScale: 'extreme-close-up', cameraAngle: 'eye-level' },
  'casual': { shotScale: 'medium', cameraAngle: 'eye-level' },
  'fashion-full': { shotScale: 'full-body', cameraAngle: 'eye-level' },
  'hero-low': { shotScale: 'full-body', cameraAngle: 'low-angle' },
  'intimate-high': { shotScale: 'close-up', cameraAngle: 'high-angle' },
  'environmental': { shotScale: 'wide', cameraAngle: 'eye-level' },
  'overhead': { shotScale: 'full-body', cameraAngle: 'bird\'s-eye' },
};

/**
 * Add composition controls to existing prompt
 */
export function enhanceWithComposition(
  prompt: string,
  shotScale: ShotScale,
  cameraAngle: CameraAngle,
): string {
  const composition = buildCompositionPrompt(shotScale, cameraAngle);
  
  // Append composition instruction at the end where FLUX pays attention
  if (!prompt.toLowerCase().includes('full-body') && !prompt.toLowerCase().includes('close-up')) {
    return `${prompt}. ${composition}`;
  }
  
  return prompt;
}

// Utility: convert Chinese terms to English shot scales
export function parseShotScaleFromChinese(chinese: string): ShotScale {
  switch(chinese.trim()) {
    case '特写': return 'extreme-close-up';
    case '近景': return 'close-up';
    case '中近景': return 'medium-close-up';
    case '中景': return 'medium';
    case '全身': return 'full-body';
    case '远景': return 'wide';
    case '大远景': return 'extreme-wide';
    default: return 'full-body'; // Default safe choice
  }
}

// Utility: convert Chinese terms to English camera angles
export function parseCameraAngleFromChinese(chinese: string): CameraAngle {
  switch(chinese.trim()) {
    case '平视': return 'eye-level';
    case '仰视': return 'low-angle';
    case '俯视': return 'high-angle';
    case '鸟瞰': return 'bird\'s-eye';
    default: return 'eye-level'; // Default safe choice
  }
}
