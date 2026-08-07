/**
 * ComfyUI 控制台提示词预设库：50 个（20 SFW + 30 NSFW）。
 * - 中文标签显示，选中后把英文自然语言内容「追加」到提示词栏（不覆盖）。
 * - 预设只描述场景/姿态/画质/内容，不包含人物说明——人物一致性由 IP-Adapter 控制。
 */

export type PromptPreset = {
  label: string;
  labelEn: string;
  text: string;
  nsfw: boolean;
};

export const PROMPT_PRESETS: PromptPreset[] = [
  // ── SFW ×20 ────────────────────────────────────────────────
  { label: '生成角色', labelEn: 'Character concept', text: 'full-body character concept, distinctive memorable design, clean neutral backdrop, sharp detail', nsfw: false },
  { label: '半身像', labelEn: 'Half-body portrait', text: 'half-body portrait framing, elegant relaxed posture, balanced composition', nsfw: false },
  { label: '近景特写', labelEn: 'Close-up', text: 'close-up head-and-shoulders shot, sharp focus on the eyes, shallow depth of field', nsfw: false },
  { label: '8K 高清', labelEn: '8K detail', text: '8k ultra-detailed, crisp textures, high resolution', nsfw: false },
  { label: '写实', labelEn: 'Photorealistic', text: 'photorealistic, natural skin texture with visible pores, lifelike', nsfw: false },
  { label: '真实摄影', labelEn: 'Real photography', text: 'candid editorial photography, realistic film look, fine grain', nsfw: false },
  { label: '全身立绘', labelEn: 'Full-body art', text: 'full-body standing artwork, complete outfit and proportions visible, vertical composition', nsfw: false },
  { label: '侧身回眸', labelEn: 'Look back', text: 'three-quarter turn looking back over the shoulder, candid gaze', nsfw: false },
  { label: '坐在沙发', labelEn: 'Sitting on sofa', text: 'sitting relaxed on a sofa, legs crossed, cozy living room, warm lamp light', nsfw: false },
  { label: '躺在床上', labelEn: 'On the bed', text: 'lying on a bed propped on one elbow, soft morning light, calm mood', nsfw: false },
  { label: '站姿', labelEn: 'Standing', text: 'confident standing pose, full body, natural weight shift', nsfw: false },
  { label: '走姿', labelEn: 'Walking', text: 'natural walking pose, caught mid-step, candid motion', nsfw: false },
  { label: '跳舞', labelEn: 'Dancing', text: 'mid-dance dynamic pose, flowing movement, energetic mood', nsfw: false },
  { label: '海滩泳池', labelEn: 'Beach / pool', text: 'beach or pool setting, golden light, swimwear, relaxed summer mood', nsfw: false },
  { label: '花园', labelEn: 'Garden', text: 'lush garden, dappled sunlight, soft botanical backdrop', nsfw: false },
  { label: '都市夜景', labelEn: 'City night', text: 'urban night scene, neon bokeh lights, cinematic city backdrop', nsfw: false },
  { label: '咖啡馆', labelEn: 'Cafe', text: 'cozy cafe window seat, warm interior light, casual atmosphere', nsfw: false },
  { label: '浴室', labelEn: 'Bathroom', text: 'bathroom setting, soft steam, clean bright tiles, fresh light', nsfw: false },
  { label: '天台日落', labelEn: 'Rooftop sunset', text: 'rooftop at sunset, golden hour glow, city skyline behind', nsfw: false },
  { label: '电影感光影', labelEn: 'Cinematic light', text: 'cinematic moody lighting, dramatic shadows, film grain', nsfw: false },

  // ── NSFW ×30 ───────────────────────────────────────────────
  { label: '巨大胸', labelEn: 'Huge breasts', text: 'huge natural breasts, prominent cleavage, full exposed chest', nsfw: true },
  { label: '巨大阴茎', labelEn: 'Large penis', text: 'large erect penis, prominent male anatomy, clearly visible', nsfw: true },
  { label: '后入式', labelEn: 'Doggy style', text: 'doggy style penetration from behind, arched back, full rear view', nsfw: true },
  { label: '插入肛门', labelEn: 'Anal sex', text: 'anal penetration, rear view, coherent anatomy', nsfw: true },
  { label: '口交', labelEn: 'Oral sex', text: 'performing oral sex, intimate close-up', nsfw: true },
  { label: '深喉', labelEn: 'Deep throat', text: 'deep throat oral, throat bulge visible, intense expression', nsfw: true },
  { label: '自慰', labelEn: 'Masturbation', text: 'solo masturbation, fingers on clearly visible vulva, before climax', nsfw: true },
  { label: '骑乘', labelEn: 'Cowgirl', text: 'cowgirl riding position, facing partner, full body in frame', nsfw: true },
  { label: '狗爬式', labelEn: 'All fours', text: 'on all fours arching the back, presented pose, rear angle', nsfw: true },
  { label: '乳交', labelEn: 'Titjob', text: 'titjob between large breasts, face visible above', nsfw: true },
  { label: '颜射', labelEn: 'Facial', text: 'facial cumshot, eyes closed, semen on face', nsfw: true },
  { label: '内射', labelEn: 'Creampie', text: 'creampie, internal cumshot, after sex visible fluids', nsfw: true },
  { label: '捆绑', labelEn: 'Bondage', text: 'consensual bondage, ropes restraining, controlled pose', nsfw: true },
  { label: '抽插特写', labelEn: 'Penetration close-up', text: 'close-up penetration shot, contact point clearly visible', nsfw: true },
  { label: '双人性爱', labelEn: 'Couple sex', text: 'consensual couple sex, intertwined bodies, intimate lighting', nsfw: true },
  { label: '3P', labelEn: 'Threesome', text: 'threesome with two partners, distinct bodies, readable composition', nsfw: true },
  { label: '群交', labelEn: 'Group sex', text: 'group sex scene, multiple adults, clear spatial separation', nsfw: true },
  { label: '露出', labelEn: 'Public exposure', text: 'public exposure, outdoor nudity, daring setting', nsfw: true },
  { label: '破衣', labelEn: 'Ripped clothes', text: 'ripped torn clothes, exposed body through tears', nsfw: true },
  { label: '丝袜', labelEn: 'Stockings', text: 'sheer stockings, garter belt, seductive leg pose', nsfw: true },
  { label: '网袜', labelEn: 'Fishnet', text: 'fishnet stockings, revealing outfit, teasing pose', nsfw: true },
  { label: '丁字裤', labelEn: 'Thong', text: 'thong pulled aside, exposed from behind, bent over', nsfw: true },
  { label: '情趣内衣', labelEn: 'Lingerie', text: 'sexy lingerie set, sheer fabric, seductive pose', nsfw: true },
  { label: '护士装', labelEn: 'Nurse roleplay', text: 'nurse roleplay outfit, short skirt, playful seduction', nsfw: true },
  { label: '教师装', labelEn: 'Teacher roleplay', text: 'teacher roleplay outfit, pencil skirt, glasses, teasing expression', nsfw: true },
  { label: '女仆装', labelEn: 'Maid roleplay', text: 'maid outfit, frilly apron, submissive seductive pose', nsfw: true },
  { label: '兔女郎', labelEn: 'Bunny girl', text: 'bunny girl outfit, ears and tail, glossy bodysuit, playful pose', nsfw: true },
  { label: '高潮表情', labelEn: 'Orgasm face', text: 'orgasm face, flushed cheeks, eyes rolled back, open mouth', nsfw: true },
  { label: '精液', labelEn: 'Cum on body', text: 'semen on body, glistening skin, after-sex glow', nsfw: true },
  { label: '玩具插入', labelEn: 'Toy insertion', text: 'sex toy insertion, vibrator, intense expression', nsfw: true },
];
