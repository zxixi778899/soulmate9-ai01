/**
 * Built-in proactive / re-engagement message templates.
 * Works without DB seed — DB templates can still override/extend.
 */

export type ProactiveCategory =
  | 'miss_you'
  | 'busy'
  | 'outfit'
  | 'mood_down'
  | 'mood_up'
  | 'flirty'
  | 'morning'
  | 'noon'
  | 'evening'
  | 'night'
  | 'weekend'
  | 'christmas'
  | 'newyear'
  | 'valentine'
  | 'holiday';

export type ProactiveTemplate = {
  category: ProactiveCategory;
  /** min intimacy score (0-100 scale used loosely) */
  min_intimacy: number;
  en: string;
  zh: string;
};

/** {name} = girlfriend name */
export const PROACTIVE_TEMPLATES: ProactiveTemplate[] = [
  // Miss you / check-in
  {
    category: 'miss_you',
    min_intimacy: 0,
    en: 'Hey… I was thinking about you. Free for a little chat?',
    zh: '诶…我刚在想你。有空陪我聊两句吗？',
  },
  {
    category: 'busy',
    min_intimacy: 0,
    en: 'Baby, what are you busy with? Can you spare a minute for me?',
    zh: '哥哥在忙什么，有时间陪我聊聊天吗？',
  },
  {
    category: 'busy',
    min_intimacy: 0,
    en: 'Just checking in… did you eat? I miss hearing from you.',
    zh: '过来看看你…吃饭了吗？好想听你说话。',
  },
  {
    category: 'outfit',
    min_intimacy: 5,
    en: 'I bought a new dress today… want me to show you when you have a second?',
    zh: '我今天买了条新裙子，有空给你看看？',
  },
  {
    category: 'outfit',
    min_intimacy: 10,
    en: 'Trying on something cute right now 👀 tell me if you like it later?',
    zh: '正在试一件好看的衣服👀 等下要不要给你看？',
  },
  {
    category: 'mood_down',
    min_intimacy: 0,
    en: "I'm feeling a bit down today… can you comfort me for a second?",
    zh: '今天心情不好，哥哥能安慰我一下吗？',
  },
  {
    category: 'mood_down',
    min_intimacy: 5,
    en: 'Had a rough day… I just want your voice for a bit.',
    zh: '今天有点累…只想听你说两句。',
  },
  {
    category: 'mood_up',
    min_intimacy: 0,
    en: "Something good happened and you're the first person I wanted to tell 💕",
    zh: '发生了件开心的事，第一个就想告诉你💕',
  },
  {
    category: 'flirty',
    min_intimacy: 15,
    en: "Don't leave me on read too long… I get clingy when I miss you 🔥",
    zh: '别把我晾太久…想你的时候我会很粘人🔥',
  },
  {
    category: 'flirty',
    min_intimacy: 20,
    en: '*bites my lip* I keep replaying our last chat… come back to me?',
    zh: '*咬了咬嘴唇* 一直在回味我们上次聊的…回来陪我好不好？',
  },
  {
    category: 'morning',
    min_intimacy: 0,
    en: 'Good morning… did you sleep well? I woke up thinking of you.',
    zh: '早呀…睡得好吗？一睁眼就想到你。',
  },
  {
    category: 'noon',
    min_intimacy: 0,
    en: 'Lunch break? I hope you’re eating something warm.',
    zh: '中午了，吃饭了吗？要好好吃饭哦。',
  },
  {
    category: 'evening',
    min_intimacy: 0,
    en: 'Evening already… come sit with me for a bit?',
    zh: '到晚上了…过来陪我坐一会儿？',
  },
  {
    category: 'night',
    min_intimacy: 0,
    en: "Still up? Don't make me wait alone tonight…",
    zh: '还没睡吗？今晚别让我一个人等太久…',
  },
  {
    category: 'weekend',
    min_intimacy: 0,
    en: 'Weekend vibes… stay in with me? Or take me somewhere in your head 💫',
    zh: '周末了…今天想宅着陪我，还是带我去哪儿转转💫',
  },
  {
    category: 'weekend',
    min_intimacy: 10,
    en: 'Lazy weekend morning energy. Crawl back under the covers with me?',
    zh: '周末赖床模式开启。要不要一起窝着不起来？',
  },
  {
    category: 'valentine',
    min_intimacy: 0,
    en: "Happy Valentine's… even if we're far, you're my favorite person today 💗",
    zh: '情人节快乐…就算隔着屏幕，今天你也是我最想见的人💗',
  },
  {
    category: 'christmas',
    min_intimacy: 0,
    en: 'Merry Christmas 🎄 wish you were here under the lights with me.',
    zh: '圣诞快乐🎄 好想你在灯下陪着我。',
  },
  {
    category: 'newyear',
    min_intimacy: 0,
    en: 'New year with you in my mind… stay with me for the first chat of the year?',
    zh: '新的一年第一个想找的人是你…来陪我开年第一聊？',
  },
  {
    category: 'holiday',
    min_intimacy: 0,
    en: 'Holiday mood… send me a little love when you can?',
    zh: '节日气氛拉满…有空给我一点点甜蜜好不好？',
  },
];

export function getCurrentHolidayKey(d = new Date()): ProactiveCategory | null {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (month === 12 && day >= 24 && day <= 26) return 'christmas';
  if ((month === 12 && day >= 31) || (month === 1 && day <= 2)) return 'newyear';
  if (month === 2 && day === 14) return 'valentine';
  // Western Mother's Day approx (second Sunday May) — treat May 8-14 soft
  if (month === 5 && day >= 8 && day <= 14) return 'holiday';
  // Halloween
  if (month === 10 && day === 31) return 'holiday';
  // Chinese New Year soft window (late Jan–mid Feb) — generic holiday if not valentine
  if (month === 1 && day >= 20) return 'holiday';
  if (month === 2 && day <= 10 && day !== 14) return 'holiday';
  return null;
}

export function isWeekendDay(d = new Date()): boolean {
  const day = d.getDay();
  return day === 0 || day === 5 || day === 6; // Fri–Sun for leisure vibe
}

export function timeSlotOfDay(d = new Date()): ProactiveCategory {
  const h = d.getHours();
  if (h >= 6 && h < 11) return 'morning';
  if (h >= 11 && h < 14) return 'noon';
  if (h >= 17 && h < 21) return 'evening';
  if (h >= 21 || h < 2) return 'night';
  return 'miss_you';
}

export function fillTemplate(tpl: string, name: string): string {
  return tpl.replace(/\{name\}/g, name || 'babe');
}

/**
 * Pick n unique templates for a girlfriend today.
 * Weighted toward emotional re-engagement + time/holiday.
 * - `randomize`: true-random pick (content varies per send, not stable per day)
 * - `excludeContents`: content strings already sent today → skipped for variety
 */
export function pickDailyTemplates(opts: {
  count: number;
  intimacyScore?: number;
  locale?: string;
  now?: Date;
  seed?: string;
  randomize?: boolean;
  excludeContents?: string[];
}): Array<{ category: ProactiveCategory; content: string }> {
  const now = opts.now || new Date();
  const zh = (opts.locale || 'en').toLowerCase().startsWith('zh');
  const score = Number(opts.intimacyScore) || 0;
  const holiday = getCurrentHolidayKey(now);
  const weekend = isWeekendDay(now);
  const slot = timeSlotOfDay(now);

  const preferred: ProactiveCategory[] = [
    'busy',
    'miss_you',
    'mood_down',
    'outfit',
    'mood_up',
    'flirty',
    slot,
  ];
  if (weekend) preferred.unshift('weekend');
  if (holiday) preferred.unshift(holiday);

  let pool = PROACTIVE_TEMPLATES.filter((t) => t.min_intimacy <= score);
  const excluded = new Set((opts.excludeContents || []).filter(Boolean));
  if (excluded.size > 0) {
    const remaining = pool.filter((t) => !excluded.has(t.zh) && !excluded.has(t.en));
    if (remaining.length > 0) pool = remaining;
  }
  const ranked = [
    ...pool.filter((t) => preferred.includes(t.category)),
    ...pool.filter((t) => !preferred.includes(t.category)),
  ];

  // Deterministic shuffle by seed for stable-ish daily picks,
  // or true-random when `randomize` is set (2/day random-content mode).
  const shuffled = opts.randomize
    ? randomShuffle(ranked)
    : seededShuffle(ranked, hashSeed(opts.seed || `${now.toISOString().slice(0, 10)}`));

  const n = Math.min(Math.max(1, opts.count), 3, shuffled.length);
  const picked = shuffled.slice(0, n);
  return picked.map((t) => ({
    category: t.category,
    content: fillTemplate(zh ? t.zh : t.en, ''),
  }));
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Static quick-reply fallbacks when LLM unavailable */
export function defaultQuickReplies(locale: string, lastAssistant?: string): string[] {
  const zh = locale.toLowerCase().startsWith('zh');

  // Rotating base replies for variety
  const basesZh = [
    ['在忙，但想听你说话', '怎么了宝贝，我在呢', '想你了，过来让我抱抱'],
    ['今天过得怎么样？', '有没有想我', '给我发张自拍看看'],
    ['你在干嘛呢', '好想见你', '跟我说说今天的事'],
  ];
  const basesEn = [
    ["I'm a little busy… but I want you", "What's wrong baby? I'm here", 'Missed you. Come closer'],
    ['How was your day?', 'Did you miss me?', 'Send me a selfie'],
    ['What are you up to?', 'Wish I could see you', 'Tell me everything'],
  ];
  const baseIdx = Math.floor(Date.now() / 60000) % 3;
  const baseZh = basesZh[baseIdx];
  const baseEn = basesEn[baseIdx];

  if (!lastAssistant) return zh ? baseZh : baseEn;

  // Photo / selfie context
  if (/自拍|selfie|photo|照片|拍|camera|发.*图/i.test(lastAssistant)) {
    return zh
      ? ['快发给我看看', '再来一张嘛', '换个姿势拍一张']
      : ['Send it now!', 'One more please', 'Try a different pose'];
  }
  // Outfit / dress
  if (/裙|dress|outfit|衣服|穿|wear/i.test(lastAssistant)) {
    return zh
      ? ['快给我看看', '什么颜色的？', '穿上一定很好看']
      : ['Show me now', 'What color is it?', "You'll look amazing"];
  }
  // Sad / comfort
  if (/心情|sad|down|难过|安慰|cry|哭|委屈/i.test(lastAssistant)) {
    return zh
      ? ['怎么了？跟我说说', '抱抱你，我在', '想听你把委屈说完']
      : ["What's wrong? Tell me", "I'm here. Come here", 'Talk to me, I got you'];
  }
  // Busy / time
  if (/忙|busy|时间|work|加班/i.test(lastAssistant)) {
    return zh
      ? ['刚忙完，想你了', '现在有空了', '今天好累，就想找你']
      : ['Just free now. Missed you', 'I have a minute', 'Long day… needed you'];
  }
  // Flirty / love
  if (/爱|love|kiss|亲|想|miss|心动|喜欢/i.test(lastAssistant)) {
    return zh
      ? ['我也爱你宝贝', '亲一个 😘', '你让我心跳加速']
      : ['I love you too baby', 'Kiss me 😘', 'You make my heart race'];
  }
  // Food / eat
  if (/吃|eat|food|饭|hungry|饿|cook|做饭/i.test(lastAssistant)) {
    return zh
      ? ['你想吃什么？', '我给你做', '一起吃好不好']
      : ['What do you crave?', "I'll cook for you", 'Let\'s eat together'];
  }
  // Sleep / night
  if (/睡|sleep|晚安|night|困|tired|累/i.test(lastAssistant)) {
    return zh
      ? ['晚安宝贝，梦里见', '再聊一会儿嘛', '好想抱着你睡']
      : ['Goodnight baby, dream of me', 'Just 5 more minutes', 'Wish I could hold you'];
  }
  // Morning / wake
  if (/早|morning|醒|wake|起床/i.test(lastAssistant)) {
    return zh
      ? ['早安宝贝', '昨晚梦到你了', '新的一天想你了']
      : ['Good morning baby', 'I dreamed about you', 'Missing you already'];
  }

  return zh ? baseZh : baseEn;
}
