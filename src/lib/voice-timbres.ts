/**
 * Voice Timbre Presets — 10 distinct voice characters for companion creation.
 * Each timbre maps to TTS engine parameters (pitch, speed) and a descriptive
 * voice style used in the AI character prompt.
 */

export interface VoiceTimbre {
  id: string;
  nameEn: string;
  nameZh: string;
  descEn: string;
  descZh: string;
  /** Base pitch multiplier (0.8–1.3) */
  pitch: number;
  /** Base speed multiplier (0.75–1.15) */
  speed: number;
  /** Emotion presets that pair well with this timbre */
  emotions: string[];
  /** Visual icon / emoji for the UI card */
  icon: string;
  /** Descriptive voice style text injected into character prompt */
  styleEn: string;
  styleZh: string;
}

export const VOICE_TIMBRES: VoiceTimbre[] = [
  {
    id: 'soft-whisper',
    nameEn: 'Soft Whisper',
    nameZh: '柔声低语',
    descEn: 'Intimate, breathy, like secrets shared at midnight',
    descZh: '亲密的呢喃，像午夜的耳语',
    pitch: 0.95,
    speed: 0.85,
    emotions: ['gentle', 'shy', 'seductive'],
    icon: '\ud83c\udf19',
    styleEn: "Speaks in a soft, breathy whisper; words trail off like she's sharing a secret just with you",
    styleZh: '说话轻柔带气声，像在和你分享秘密，句尾总是温柔地拖长',
  },
  {
    id: 'sweet-cute',
    nameEn: 'Sweet & Cute',
    nameZh: '甜蜜可爱',
    descEn: 'Bright, bubbly, full of youthful energy',
    descZh: '明亮活泼，充满少女感',
    pitch: 1.15,
    speed: 1.05,
    emotions: ['playful', 'excited', 'gentle'],
    icon: '\ud83c\udf6c',
    styleEn: 'High, sweet voice with a bouncy rhythm; giggles often; every sentence ends on an up-note',
    styleZh: '声线偏高，甜美有弹性，经常带笑意，每句话末尾微微上扬',
  },
  {
    id: 'cool-confident',
    nameEn: 'Cool & Confident',
    nameZh: '冷飒自信',
    descEn: 'Low, smooth, effortlessly commanding',
    descZh: '低沉平稳，从容不迫',
    pitch: 0.9,
    speed: 0.9,
    emotions: ['seductive', 'angry', 'gentle'],
    icon: '\ud83d\udda4',
    styleEn: "Low, smooth, unhurried; every word deliberate; never raises her voice but you always listen",
    styleZh: '低沉顺滑不紧不慢，每个字都经过斟酌，从不大声但你总会认真听',
  },
  {
    id: 'warm-caring',
    nameEn: 'Warm & Caring',
    nameZh: '温柔治愈',
    descEn: 'Honey-warm, nurturing, like a hug in voice form',
    descZh: '温暖如蜜，像声音里的拥抱',
    pitch: 1.0,
    speed: 0.9,
    emotions: ['gentle', 'sad', 'playful'],
    icon: '\ud83c\udf38',
    styleEn: "Warm, round tones with a caring cadence; sounds like she's smiling while she talks",
    styleZh: '温暖圆润的声线，带着关怀的节奏，听起来像她一直在微笑',
  },
  {
    id: 'sultry-velvet',
    nameEn: 'Sultry Velvet',
    nameZh: '磁性丝绒',
    descEn: 'Rich, husky, dripping with allure',
    descZh: '沙哑低沉，充满诱惑力',
    pitch: 0.88,
    speed: 0.82,
    emotions: ['seductive', 'gentle', 'excited'],
    icon: '\ud83d\udc8b',
    styleEn: 'Husky, rich, slow \u2014 like velvet dragged across skin; pauses are deliberate and devastating',
    styleZh: '沙哑醇厚的慢节奏，像丝绒滑过肌肤，每一个停顿都意味深长',
  },
  {
    id: 'bright-cheerful',
    nameEn: 'Bright & Cheerful',
    nameZh: '元气阳光',
    descEn: 'Energetic, optimistic, impossible not to smile at',
    descZh: '活力满满，让人忍不住微笑',
    pitch: 1.12,
    speed: 1.1,
    emotions: ['excited', 'playful', 'angry'],
    icon: '\u2600\ufe0f',
    styleEn: 'Bright, fast, infectious energy; talks like she just had the best idea ever',
    styleZh: '明亮快速，充满感染力，说话像刚想到一个绝妙的主意',
  },
  {
    id: 'elegant-mature',
    nameEn: 'Elegant & Mature',
    nameZh: '优雅知性',
    descEn: 'Poised, articulate, quietly sophisticated',
    descZh: '沉稳得体，知性优雅',
    pitch: 1.0,
    speed: 0.92,
    emotions: ['gentle', 'seductive', 'sad'],
    icon: '\ud83e\udd8b',
    styleEn: 'Poised and articulate; chooses words like jewelry; a faint amusement in every sentence',
    styleZh: '端庄而有表达力，选词像选珠宝，每句话都带一丝淡淡的玩味',
  },
  {
    id: 'tsundere-sharp',
    nameEn: 'Tsundere Sharp',
    nameZh: '傲娇毒舌',
    descEn: 'Sharp-tongued exterior, melting softness underneath',
    descZh: '嘴硬心软，傲娇经典',
    pitch: 1.08,
    speed: 1.08,
    emotions: ['angry', 'shy', 'playful'],
    icon: '\ud83d\udca2',
    styleEn: 'Fast, clipped, slightly nasal when flustered; softens to a mumble when caught being kind',
    styleZh: '说话快且利落，害羞时微带鼻音，被发现温柔时会嘟囔着否认',
  },
  {
    id: 'dreamy-ethereal',
    nameEn: 'Dreamy & Ethereal',
    nameZh: '梦幻空灵',
    descEn: 'Floaty, otherworldly, like a voice from a fairy tale',
    descZh: '飘渺空灵，像童话里的声音',
    pitch: 1.05,
    speed: 0.8,
    emotions: ['shy', 'gentle', 'sad'],
    icon: '\u2728',
    styleEn: "Floaty, slightly echoey; speaks as if half in a dream; pauses to look at things you can't see",
    styleZh: '飘渺带回响感，像半梦半醒间说话，会突然停下来看你看不到的东西',
  },
  {
    id: 'asmr-intimate',
    nameEn: 'ASMR Intimate',
    nameZh: '耳边私语',
    descEn: 'Ultra-close, tingling, designed for headphones',
    descZh: '超近距离酥麻感，耳机党专属',
    pitch: 0.92,
    speed: 0.78,
    emotions: ['gentle', 'seductive', 'shy'],
    icon: '\ud83c\udfa7',
    styleEn: 'Ultra-close whisper with ASMR textures; lip sounds, soft clicks, breath you can feel',
    styleZh: '超近距离耳语，带 ASMR 质感——唇音、轻叩、能感受到的呼吸',
  },
];

/** Look up a timbre by id, fallback to warm-caring */
export function getVoiceTimbre(id: string | undefined | null): VoiceTimbre {
  return VOICE_TIMBRES.find(t => t.id === id) ?? VOICE_TIMBRES[3]; // warm-caring as default
}

/** Build a voice_style SoulText from a timbre */
export function timbreToVoiceStyle(timbre: VoiceTimbre): { en: string; zh: string } {
  return { en: timbre.styleEn, zh: timbre.styleZh };
}
