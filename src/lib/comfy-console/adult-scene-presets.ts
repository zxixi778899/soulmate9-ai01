import type { NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { ImageModelFamily } from '@/lib/image-generation-routing';

export type AdultScenePreset = {
  id: string;
  level: 3 | 4 | 5;
  label: string;
  scene: string;
};

const LEVEL_3_SCENES = [
  ['window-light-standing', '窗边站姿', 'standing nude beside a tall window, relaxed weight shift, direct gaze, tasteful nonsexual presentation, bright diffused daylight'],
  ['studio-seated', '影棚坐姿', 'seated nude on a low studio cube, knees angled naturally, hands relaxed away from intimate areas, seamless warm-gray backdrop'],
  ['bathroom-mirror', '浴室镜前', 'nude beside a clean bathroom mirror after a shower, damp hair, relaxed posture, bright flattering vanity light'],
  ['bedside-morning', '卧室晨光', 'nude at the edge of a neatly made bed, natural waking stretch, soft morning sunlight and balanced fill'],
  ['balcony-back-view', '阳台背影', 'nude three-quarter back view on a private balcony, looking over one shoulder, golden-hour rim light'],
  ['fine-art-recline', '艺术侧卧', 'fine-art nude reclining sideways on linen, elegant extended silhouette, nonsexual pose, soft directional studio light'],
  ['shower-profile', '淋浴侧影', 'nude profile beneath a modern shower, water droplets visible, calm expression, bright clean overhead and frontal fill'],
  ['vanity-preparation', '梳妆台前', 'nude seated at a vanity while arranging her hair, composed expression, warm practical bulbs with soft frontal fill'],
  ['curtain-silhouette', '纱帘轮廓', 'nude body framed by sheer curtains, readable anatomy rather than silhouette, bright backlight balanced by frontal fill'],
  ['poolside-dryoff', '泳池擦身', 'nude drying off beside a private pool, towel held at one side, natural standing posture, clear afternoon sunlight'],
  ['loft-stretch', '阁楼伸展', 'nude full-body stretch in a bright loft, arms raised, balanced stance, large softbox-quality window light'],
  ['sofa-candid', '沙发随拍', 'nude relaxed on a modern sofa, candid seated posture, no sexual action, bright editorial living-room lighting'],
  ['dressing-room', '更衣室', 'nude between outfits in a private dressing room, one hand holding a garment, neutral natural pose, clear mirror lighting'],
  ['white-sheet-wrap', '白床单', 'nude with a white sheet loosely gathered at the hips, upper body visible, serene expression, high-key soft lighting'],
  ['floor-seated', '地毯坐姿', 'nude seated naturally on a textured rug, upright posture and separated limbs, bright side key with gentle fill'],
  ['garden-private', '私家庭院', 'nude standing in a secluded garden, relaxed arms, nonsexual fine-art presentation, sunlit foliage and clean skin tones'],
  ['tub-edge', '浴缸边缘', 'nude seated on the edge of a freestanding bathtub, feet on the floor, composed posture, bright spa lighting'],
  ['robe-opening', '浴袍滑落', 'adult nude as an open robe slips from the shoulders, still standing naturally, fashion-editorial framing and soft key light'],
  ['staircase-pose', '楼梯站姿', 'nude posed naturally on a private interior staircase, full body visible, architectural composition, bright controlled lighting'],
  ['backdrop-turn', '转身回眸', 'nude mid-turn against a neutral photographic backdrop, clear full-body anatomy, confident gaze, even studio exposure'],
] as const;

const LEVEL_4_SCENES = [
  ['bed-solo', '床上独处', 'explicit adult solo masturbation on a bed before climax, clear purposeful hand placement, readable anatomy, bright soft bedroom light'],
  ['sofa-solo', '沙发独处', 'explicit adult solo masturbation seated on a sofa before climax, legs positioned clearly, coherent hands, warm balanced practical light'],
  ['mirror-solo', '镜前独处', 'explicit adult solo masturbation before a full-length mirror, reflection and primary body aligned, clear action, bright vanity lighting'],
  ['shower-solo', '淋浴独处', 'explicit adult solo masturbation beneath a shower before climax, stable standing support, visible water detail, clean bright bathroom light'],
  ['chair-solo', '椅上独处', 'explicit adult solo masturbation on a sturdy chair before climax, readable seated anatomy, direct gaze, controlled studio illumination'],
  ['floor-solo', '地毯独处', 'explicit adult solo masturbation seated on a soft rug before climax, balanced pose, unobstructed anatomy, bright side key and fill'],
  ['window-solo', '窗边独处', 'explicit adult solo masturbation beside a private window before climax, supported standing pose, clear hands, diffused daylight and fill'],
  ['tub-solo', '浴缸独处', 'explicit adult solo masturbation in a freestanding bathtub before climax, upper body supported, clear action, luminous spa lighting'],
  ['vanity-solo', '梳妆台独处', 'explicit adult solo masturbation seated at a vanity before climax, mirror composition remains coherent, bright flattering bulbs'],
  ['kneeling-solo', '跪姿独处', 'explicit adult solo masturbation in a stable kneeling pose before climax, anatomically coherent hands and hips, clean studio backdrop'],
  ['reclining-solo', '侧卧独处', 'explicit adult solo masturbation while reclining sideways before climax, readable hand contact, elegant diagonal composition, soft bright key light'],
  ['upright-bed-solo', '床头坐姿', 'explicit adult solo masturbation sitting upright against pillows before climax, clear anatomy and hands, bright morning bedroom light'],
  ['private-balcony-solo', '私密阳台', 'explicit adult solo masturbation on a secluded balcony before climax, stable seated pose, warm sunset key with frontal fill'],
  ['dressing-room-solo', '更衣室独处', 'explicit adult solo masturbation in a private dressing room before climax, clothing nearby, coherent mirror perspective and bright fill'],
  ['high-key-solo', '高调影棚', 'explicit adult solo masturbation in a high-key studio before climax, full-body composition, precise anatomy, even shadowless exposure'],
  ['low-bed-solo', '床沿独处', 'explicit adult solo masturbation at the edge of a low bed before climax, grounded feet and readable posture, bright cinematic side light'],
  ['arched-recline-solo', '仰卧独处', 'explicit adult solo masturbation reclining on her back before climax, natural body arch, clear hand action, balanced overhead and frontal light'],
  ['cushion-solo', '靠垫独处', 'explicit adult solo masturbation among large cushions before climax, body fully readable, purposeful expression, soft diffused light'],
  ['night-lamp-solo', '夜灯独处', 'explicit adult solo masturbation before climax in a private bedroom at night, warm lamp motivated key plus sufficient frontal fill'],
  ['editorial-solo', '杂志构图', 'explicit adult solo masturbation before climax photographed as a polished adult editorial, unambiguous action, accurate anatomy, bright professional lighting'],
] as const;

const LEVEL_5_SCENES = [
  ['bed-face-to-face', '床上相拥', 'explicit consensual sex between unmistakably adult partners on a bed, face-to-face position, coherent contact and anatomy, bright soft bedroom light'],
  ['bed-rear-entry', '床上后入', 'explicit consensual rear-entry sex between unmistakably adult partners on a bed, readable full-body alignment, coherent contact, bright side key and fill'],
  ['sofa-couple', '沙发情侣', 'explicit consensual sex between unmistakably adult partners on a sofa, stable supported pose, distinct limbs and faces, warm balanced room light'],
  ['standing-couple', '站立情侣', 'explicit consensual standing sex between unmistakably adult partners, supported balance and clear physical alignment, bright studio-quality light'],
  ['cowgirl-couple', '女上位', 'explicit consensual woman-on-top sex between unmistakably adult partners, readable centered composition, coherent hips and hands, soft frontal light'],
  ['reverse-couple', '反向骑乘', 'explicit consensual reverse riding position between unmistakably adult partners, clear body separation and contact, bright controlled bedroom lighting'],
  ['side-by-side-couple', '侧卧情侣', 'explicit consensual side-lying sex between unmistakably adult partners, intertwined bodies remain readable, gentle bright window light'],
  ['chair-couple', '椅上情侣', 'explicit consensual sex between unmistakably adult partners using a sturdy chair, supported seated pose, coherent anatomy, clear studio exposure'],
  ['shower-couple', '淋浴情侣', 'explicit consensual sex between unmistakably adult partners in a shower, stable wall support, readable anatomy, bright clean bathroom lighting'],
  ['counter-couple', '台边情侣', 'explicit consensual sex between unmistakably adult partners at a sturdy counter, supported body placement, clear contact, bright practical and fill light'],
  ['floor-couple', '地毯情侣', 'explicit consensual sex between unmistakably adult partners on a rug, balanced pose and distinct limbs, soft bright side lighting'],
  ['window-couple', '窗边情侣', 'explicit consensual sex between unmistakably adult partners beside a private window, readable silhouettes with strong frontal fill and correct exposure'],
  ['hotel-couple', '酒店情侣', 'explicit consensual sex between unmistakably adult partners in an upscale hotel room, coherent intimate pose, bright premium editorial lighting'],
  ['studio-couple', '影棚情侣', 'explicit consensual sex between unmistakably adult partners against a seamless studio backdrop, anatomically precise contact, even high-key exposure'],
  ['kneeling-couple', '跪姿情侣', 'explicit consensual sex between unmistakably adult partners in a supported kneeling position, clear hands, faces and body alignment, bright softbox light'],
  ['edge-of-bed-couple', '床沿情侣', 'explicit consensual sex between unmistakably adult partners at the edge of a bed, grounded supported posture, clear anatomy, warm key and frontal fill'],
  ['embrace-couple', '亲密拥抱', 'explicit consensual sex between unmistakably adult partners in a close embrace, both adult faces visible, coherent contact, flattering bright light'],
  ['private-loft-couple', '阁楼情侣', 'explicit consensual sex between unmistakably adult partners in a private loft, full-body editorial composition, bright window light and balanced fill'],
  ['climax-couple', '高潮时刻', 'explicit consensual sex between unmistakably adult partners through climax, requested sexual fluids visible, coherent anatomy, bright professional exposure'],
  ['afterglow-couple', '高潮余韵', 'explicit consensual adult couple immediately after climax with visible sexual fluids, intertwined bodies still anatomically readable, soft bright afterglow lighting'],
] as const;

function toPresets(level: 3 | 4 | 5, rows: readonly (readonly [string, string, string])[]): AdultScenePreset[] {
  return rows.map(([id, label, scene]) => ({ id: `nsfw-${level}-${id}`, level, label, scene }));
}

export const ADULT_SCENE_PRESETS: Record<3 | 4 | 5, AdultScenePreset[]> = {
  3: toPresets(3, LEVEL_3_SCENES),
  4: toPresets(4, LEVEL_4_SCENES),
  5: toPresets(5, LEVEL_5_SCENES),
};

export function selectAdultScenePreset(
  intensity: NsfwIntensity,
  random: () => number = Math.random,
): AdultScenePreset | null {
  if (intensity < 3) return null;
  const level = intensity as 3 | 4 | 5;
  const presets = ADULT_SCENE_PRESETS[level];
  const index = Math.min(presets.length - 1, Math.max(0, Math.floor(random() * presets.length)));
  return presets[index];
}

export function adultModelPromptSuffix(modelFamily: ImageModelFamily): string {
  if (modelFamily === 'pony') {
    return 'score_9, score_8_up, score_7_up, source_photo, anatomically coherent adult bodies, distinct limbs and hands, correct physical contact, realistic skin texture';
  }
  if (modelFamily === 'illustrious') {
    return 'masterpiece, best quality, absurdres, coherent adult anatomy, readable silhouettes, clean linework, polished shading';
  }
  return 'FLUX natural-language composition, anatomically coherent adult bodies, correct physical relationships, natural skin texture, professional photography';
}
