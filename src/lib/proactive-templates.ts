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
 */
export function pickDailyTemplates(opts: {
  count: number;
  intimacyScore?: number;
  locale?: string;
  now?: Date;
  seed?: string;
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

  const pool = PROACTIVE_TEMPLATES.filter((t) => t.min_intimacy <= score);
  const ranked = [
    ...pool.filter((t) => preferred.includes(t.category)),
    ...pool.filter((t) => !preferred.includes(t.category)),
  ];

  // Deterministic shuffle by seed for stable-ish daily picks
  const seed = hashSeed(opts.seed || `${now.toISOString().slice(0, 10)}`);
  const shuffled = seededShuffle(ranked, seed);

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
  const baseZh = [
    '在忙，但想听你说话',
    '怎么了宝贝，我在呢',
    '想你了，过来让我抱抱',
  ];
  const baseEn = [
    "I'm a little busy… but I want you",
    "What's wrong baby? I'm here",
    'Missed you. Come closer',
  ];
  if (!lastAssistant) return zh ? baseZh : baseEn;

  // Light context hooks
  if (/裙|dress|outfit|衣服/i.test(lastAssistant)) {
    return zh
      ? ['快给我看看', '什么颜色的？', '穿上一定很好看']
      : ['Show me now', 'What color is it?', "You'll look amazing"];
  }
  if (/心情|sad|down|难过|安慰/i.test(lastAssistant)) {
    return zh
      ? ['怎么了？跟我说说', '抱抱你，我在', '想听你把委屈说完']
      : ["What's wrong? Tell me", "I'm here. Come here", 'Talk to me, I got you'];
  }
  if (/忙|busy|时间/i.test(lastAssistant)) {
    return zh
      ? ['刚忙完，想你了', '现在有空了', '今天好累，就想找你']
      : ['Just free now. Missed you', 'I have a minute', 'Long day… needed you'];
  }
  return zh ? baseZh : baseEn;
}
