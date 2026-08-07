/**
 * ComfyUI 控制台「完整预设提示词」库：50 个（20 SFW + 30 NSFW）。
 * - 每个预设都是一段「完整」英文提示词（场景/姿态 + 构图 + 画质 + 光影），
 *   不包含人物说明——人物一致性由 IP-Adapter 控制。
 * - 中文标签显示；选择后可「追加」或「独立替换」（控制台有模式切换）。
 */

export type PromptPreset = {
  label: string;
  text: string;
  nsfw: boolean;
};

const SFW_TAIL =
  ', natural skin texture, photorealistic, 8k, sharp focus, editorial photography';
const NSFW_TAIL =
  ', explicit adult content, coherent realistic anatomy, natural skin texture, photorealistic, 8k, sharp focus';

export const PROMPT_PRESETS: PromptPreset[] = [
  // ── SFW ×20（完整提示词）────────────────────────────────────
  { label: '生成角色', text: `full-body character concept, distinctive memorable design, clean neutral studio backdrop, soft directional lighting${SFW_TAIL}`, nsfw: false },
  { label: '半身像', text: `half-body portrait, waist-up framing, relaxed natural posture, soft diffused studio lighting, gentle eye contact${SFW_TAIL}`, nsfw: false },
  { label: '近景特写', text: `close-up head-and-shoulders shot, sharp focus on the eyes, shallow depth of field, soft catchlights, intimate framing${SFW_TAIL}`, nsfw: false },
  { label: '8K 高清', text: `ultra high resolution 8k render, crisp textures, fine detail in hair and skin, high dynamic range lighting${SFW_TAIL}`, nsfw: false },
  { label: '写实', text: `photorealistic portrait, lifelike skin texture with visible pores, realistic proportions, natural color grading${SFW_TAIL}`, nsfw: false },
  { label: '真实摄影', text: `candid editorial photography, realistic film look, fine grain, natural pose, believable environment${SFW_TAIL}`, nsfw: false },
  { label: '全身立绘', text: `full-body standing artwork, complete outfit and proportions visible, vertical composition, balanced pose, clean background${SFW_TAIL}`, nsfw: false },
  { label: '侧身回眸', text: `three-quarter turn looking back over the shoulder, candid gaze at camera, soft side light, elegant silhouette${SFW_TAIL}`, nsfw: false },
  { label: '坐在沙发', text: `sitting relaxed on a sofa, legs crossed, cozy living room, warm lamp light, comfortable intimate atmosphere${SFW_TAIL}`, nsfw: false },
  { label: '躺在床上', text: `lying on a bed propped on one elbow, soft morning light through curtains, calm intimate mood, natural sheet texture${SFW_TAIL}`, nsfw: false },
  { label: '站姿', text: `confident standing pose, full body, natural weight shift, relaxed shoulders, clean studio backdrop${SFW_TAIL}`, nsfw: false },
  { label: '走姿', text: `natural walking pose, caught mid-step, candid motion, dynamic framing, street or indoor environment${SFW_TAIL}`, nsfw: false },
  { label: '跳舞', text: `mid-dance dynamic pose, flowing movement, energetic mood, expressive motion blur on edges${SFW_TAIL}`, nsfw: false },
  { label: '海滩泳池', text: `beach or pool setting, golden sunlight, swimwear, relaxed summer mood, sparkling water background${SFW_TAIL}`, nsfw: false },
  { label: '花园', text: `lush garden, dappled sunlight through leaves, soft botanical backdrop, fresh natural colors${SFW_TAIL}`, nsfw: false },
  { label: '都市夜景', text: `urban night scene, neon bokeh lights, cinematic city backdrop, cool blue and magenta tones${SFW_TAIL}`, nsfw: false },
  { label: '咖啡馆', text: `cozy cafe window seat, warm interior light, casual atmosphere, blurred cafe background, morning coffee mood${SFW_TAIL}`, nsfw: false },
  { label: '浴室', text: `bathroom setting, soft steam, clean bright tiles, fresh airy light, relaxed private atmosphere${SFW_TAIL}`, nsfw: false },
  { label: '天台日落', text: `rooftop at sunset, golden hour glow, city skyline behind, warm rim light, calm evening mood${SFW_TAIL}`, nsfw: false },
  { label: '电影感光影', text: `cinematic moody lighting, dramatic shadows, teal and orange grade, film grain, cinematic depth${SFW_TAIL}`, nsfw: false },

  // ── NSFW ×30（完整提示词）────────────────────────────────────
  { label: '巨大胸', text: `huge natural breasts, prominent cleavage, full exposed chest, perky nipples, sensual pose${NSFW_TAIL}`, nsfw: true },
  { label: '巨大阴茎', text: `large erect penis, prominent male anatomy clearly visible, muscular lower body, confident stance${NSFW_TAIL}`, nsfw: true },
  { label: '后入式', text: `doggy style penetration from behind, arched back, full rear view, deep thrust visible, intense expression${NSFW_TAIL}`, nsfw: true },
  { label: '插入肛门', text: `anal penetration, rear view, clearly visible contact point, tight grip, moaning expression${NSFW_TAIL}`, nsfw: true },
  { label: '口交', text: `performing oral sex, intimate close-up, lips around the shaft, eye contact upward${NSFW_TAIL}`, nsfw: true },
  { label: '深喉', text: `deep throat oral, throat bulge visible, hands gripping, tears at the corner of the eyes${NSFW_TAIL}`, nsfw: true },
  { label: '自慰', text: `solo masturbation, fingers on clearly visible vulva, legs spread, flushed cheeks, before climax${NSFW_TAIL}`, nsfw: true },
  { label: '骑乘', text: `cowgirl riding position, facing partner, bouncing motion, full body in frame, breasts in motion${NSFW_TAIL}`, nsfw: true },
  { label: '狗爬式', text: `on all fours arching the back, presented rear pose, head turned to camera, submissive inviting gaze${NSFW_TAIL}`, nsfw: true },
  { label: '乳交', text: `titjob between large breasts, shaft pressed between cleavage, face visible above, teasing smile${NSFW_TAIL}`, nsfw: true },
  { label: '颜射', text: `facial cumshot, eyes closed, mouth open, semen on face and hair, satisfied expression${NSFW_TAIL}`, nsfw: true },
  { label: '内射', text: `creampie, internal cumshot, after-sex visible fluids dripping, relaxed satisfied pose${NSFW_TAIL}`, nsfw: true },
  { label: '捆绑', text: `consensual bondage, ropes restraining arms and chest, controlled kneeling pose, skin marks from rope${NSFW_TAIL}`, nsfw: true },
  { label: '抽插特写', text: `close-up penetration shot, contact point clearly visible, glistening skin, intense intimate framing${NSFW_TAIL}`, nsfw: true },
  { label: '双人性爱', text: `consensual couple sex, intertwined bodies, missionary position, intimate eye contact, warm lighting${NSFW_TAIL}`, nsfw: true },
  { label: '3P', text: `threesome with two partners, distinct bodies and faces, readable composition, three-way engagement${NSFW_TAIL}`, nsfw: true },
  { label: '群交', text: `group sex scene with multiple adults, clear spatial separation, varied poses, erotic group dynamic${NSFW_TAIL}`, nsfw: true },
  { label: '露出', text: `public exposure, outdoor nudity, daring setting, hand over mouth, blushing arousal${NSFW_TAIL}`, nsfw: true },
  { label: '破衣', text: `ripped torn clothes revealing the body, fabric tears across chest and hips, teasing pose${NSFW_TAIL}`, nsfw: true },
  { label: '丝袜', text: `sheer stockings with garter belt, seductive leg pose, high heels, glossy nylon sheen${NSFW_TAIL}`, nsfw: true },
  { label: '网袜', text: `fishnet stockings, revealing outfit, leg lifted teasingly, bold eye contact${NSFW_TAIL}`, nsfw: true },
  { label: '丁字裤', text: `thong pulled aside, exposed from behind, bent over pose, looking back at camera${NSFW_TAIL}`, nsfw: true },
  { label: '情趣内衣', text: `sexy lingerie set, sheer lace fabric, matching bra and panties, seductive reclining pose${NSFW_TAIL}`, nsfw: true },
  { label: '护士装', text: `nurse roleplay outfit, short white dress, thigh-high stockings, playful seductive expression${NSFW_TAIL}`, nsfw: true },
  { label: '教师装', text: `teacher roleplay outfit, pencil skirt, fitted blouse, glasses, strict teasing expression${NSFW_TAIL}`, nsfw: true },
  { label: '女仆装', text: `maid outfit, frilly apron, short skirt, submissive seductive pose, kneeling service mood${NSFW_TAIL}`, nsfw: true },
  { label: '兔女郎', text: `bunny girl outfit, ears and tail, glossy bodysuit, playful pose, seductive over-the-shoulder look${NSFW_TAIL}`, nsfw: true },
  { label: '高潮表情', text: `orgasm face, flushed cheeks, eyes rolled back, open mouth, trembling pleasure${NSFW_TAIL}`, nsfw: true },
  { label: '精液', text: `semen on body, glistening skin, after-sex glow, satisfied exhausted expression${NSFW_TAIL}`, nsfw: true },
  { label: '玩具插入', text: `sex toy insertion, vibrator held in place, intense expression, legs spread wide${NSFW_TAIL}`, nsfw: true },
];
