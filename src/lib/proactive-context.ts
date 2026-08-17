/**
 * Proactive Context Builder
 *
 * Assembles real-world context (weather, season, holiday, time of day, topic direction)
 * that is injected into the LLM prompt as "inspiration" — not templates.
 * Weather is fetched from Open-Meteo API (free, no key needed).
 */

import { logger } from '@/lib/logger';

export interface ProactiveContext {
  weather?: { condition: string; temperature: number; description: string };
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  holiday?: string;
  timeOfDay?: 'early_evening' | 'mid_evening' | 'late_night';
  topicDirection?: string;
  dayOfWeek?: 'weekday' | 'weekend';
}

/** Topic direction pool — inspiration hints for LLM, not templates. */
const TOPIC_DIRECTIONS_ZH = [
  '分享今天发生的一件小事',
  '聊你最近在做的事情（和你的职业/爱好相关）',
  '关心他今天过得怎么样',
  '提到天气或季节变化',
  '分享你"看到/听到/吃到"的什么东西',
  '表达一种微妙的情绪（想他/无聊/开心/小烦恼）',
  '提议一起做什么（看电影/吃饭/散步/打游戏）',
  '聊一个你最近感兴趣的话题',
  '回忆你们之前的某次对话',
  '撒个娇或开个小玩笑',
];

const TOPIC_DIRECTIONS_EN = [
  'Share a little thing that happened today',
  'Talk about something you\'ve been doing (related to your occupation/hobbies)',
  'Ask how his day went — show genuine interest',
  'Mention the weather or seasonal change',
  'Share something you saw / heard / ate recently',
  'Express a subtle emotion (missing him / boredom / happiness / small annoyance)',
  'Suggest doing something together (movie / dinner / walk / gaming)',
  'Bring up a topic you\'ve been interested in lately',
  'Recall a previous conversation you had together',
  'Be playful or tease him a little',
];

/** Simple hash for seed-based deterministic selection. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/** Get local hour from UTC date + timezone offset (minutes, JS convention: UTC+8 = -480). */
export function getLocalHour(now: Date, tzOffsetMinutes: number): number {
  const localMs = now.getTime() - tzOffsetMinutes * 60_000;
  return new Date(localMs).getUTCHours();
}

/** Determine the season from the current date. */
function getSeason(now: Date): 'spring' | 'summer' | 'autumn' | 'winter' {
  const month = now.getUTCMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** Time of day classification for evening window. */
function getTimeOfDay(hour: number): 'early_evening' | 'mid_evening' | 'late_night' | undefined {
  if (hour >= 18 && hour < 20) return 'early_evening';
  if (hour >= 20 && hour < 22) return 'mid_evening';
  if (hour >= 22 || hour < 2) return 'late_night';
  return undefined;
}

/** Check if the date falls on a weekend. */
function isWeekend(now: Date): boolean {
  const day = now.getUTCDay();
  return day === 0 || day === 6;
}

/** Pick a random topic direction based on seed for deterministic per-user variety. */
function pickTopicDirection(now: Date, tzOffset: number, locale: string): string {
  const seed = `${now.toISOString().slice(0, 10)}:${tzOffset}`;
  const index = hashSeed(seed) % TOPIC_DIRECTIONS_ZH.length;
  return locale.startsWith('zh') ? TOPIC_DIRECTIONS_ZH[index] : TOPIC_DIRECTIONS_EN[index];
}

/** Holiday lookup — simple static calendar for common holidays. */
function getHolidayName(now: Date): string | undefined {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const key = `${month}-${day}`;
  const holidays: Record<string, string> = {
    '1-1': 'New Year\'s Day',
    '2-14': 'Valentine\'s Day',
    '3-8': 'International Women\'s Day',
    '5-1': 'May Day',
    '10-31': 'Halloween',
    '12-25': 'Christmas',
    '12-31': 'New Year\'s Eve',
  };
  return holidays[key];
}

/**
 * Fetch weather context from Open-Meteo (free, no API key).
 * Uses a coarse location derived from timezone offset as a rough proxy.
 */
async function getWeatherContext(tzOffset: number): Promise<ProactiveContext['weather']> {
  try {
    // Rough latitude/longitude from timezone (very approximate)
    const longitude = Math.max(-180, Math.min(180, -tzOffset / 4));
    const latitude = 35; // default mid-latitude

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;

    const data = await res.json();
    const temp = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;

    if (typeof temp !== 'number' || typeof code !== 'number') return undefined;

    const conditionMap: Record<number, string> = {
      0: 'clear', 1: 'clear', 2: 'cloudy', 3: 'overcast',
      45: 'foggy', 48: 'foggy',
      51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
      61: 'rain', 63: 'rain', 65: 'heavy rain',
      71: 'snow', 73: 'snow', 75: 'heavy snow',
      80: 'rain', 81: 'rain', 82: 'heavy rain',
      95: 'thunderstorm', 96: 'thunderstorm', 99: 'thunderstorm',
    };

    const condition = conditionMap[code] || 'unknown';
    const descriptions: Record<string, { zh: string; en: string }> = {
      clear: { zh: '晴天', en: 'clear skies' },
      cloudy: { zh: '多云', en: 'cloudy' },
      overcast: { zh: '阴天', en: 'overcast' },
      foggy: { zh: '有雾', en: 'foggy' },
      drizzle: { zh: '小雨', en: 'light drizzle' },
      rain: { zh: '下雨', en: 'raining' },
      'heavy rain': { zh: '大雨', en: 'heavy rain' },
      snow: { zh: '下雪', en: 'snowing' },
      'heavy snow': { zh: '大雪', en: 'heavy snow' },
      thunderstorm: { zh: '雷暴', en: 'thunderstorm' },
      unknown: { zh: '天气', en: 'weather' },
    };

    const desc = descriptions[condition] || descriptions.unknown;
    return {
      condition,
      temperature: Math.round(temp),
      description: `${desc.en}, ${Math.round(temp)}°C`,
    };
  } catch (err) {
    logger.debug('[proactive-context] weather fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/**
 * Build the full proactive context for message generation.
 */
export async function buildProactiveContext(
  tzOffset: number,
  locale: string = 'en',
): Promise<ProactiveContext> {
  const now = new Date();
  const hour = getLocalHour(now, tzOffset);

  const [weather] = await Promise.all([
    getWeatherContext(tzOffset),
  ]);

  return {
    weather: weather || undefined,
    season: getSeason(now),
    holiday: getHolidayName(now),
    timeOfDay: getTimeOfDay(hour),
    topicDirection: pickTopicDirection(now, tzOffset, locale),
    dayOfWeek: isWeekend(now) ? 'weekend' : 'weekday',
  };
}

/**
 * Format context into a prompt fragment for LLM injection.
 */
export function formatContextForPrompt(ctx: ProactiveContext, zh: boolean): string {
  const parts: string[] = [];

  if (ctx.weather) {
    parts.push(zh ? `当前天气：${ctx.weather.description}` : `Weather: ${ctx.weather.description}`);
  }
  if (ctx.season) {
    const seasonMap: Record<string, { zh: string; en: string }> = {
      spring: { zh: '春天', en: 'spring' },
      summer: { zh: '夏天', en: 'summer' },
      autumn: { zh: '秋天', en: 'autumn' },
      winter: { zh: '冬天', en: 'winter' },
    };
    const s = seasonMap[ctx.season] || { zh: ctx.season, en: ctx.season };
    parts.push(zh ? `当前季节：${s.zh}` : `Season: ${s.en}`);
  }
  if (ctx.holiday) {
    parts.push(zh ? `今天是：${ctx.holiday}` : `Today is: ${ctx.holiday}`);
  }
  if (ctx.timeOfDay) {
    const todMap: Record<string, { zh: string; en: string }> = {
      early_evening: { zh: '傍晚', en: 'early evening' },
      mid_evening: { zh: '晚上', en: 'evening' },
      late_night: { zh: '深夜', en: 'late night' },
    };
    const tod = todMap[ctx.timeOfDay] || { zh: ctx.timeOfDay, en: ctx.timeOfDay };
    parts.push(zh ? `现在时段：${tod.zh}` : `Time: ${tod.en}`);
  }
  if (ctx.topicDirection) {
    parts.push(zh ? `话题方向：${ctx.topicDirection}` : `Topic direction: ${ctx.topicDirection}`);
  }
  if (ctx.dayOfWeek) {
    parts.push(zh ? `今天${ctx.dayOfWeek === 'weekend' ? '周末' : '工作日'}` : ctx.dayOfWeek === 'weekend' ? 'Weekend' : 'Weekday');
  }

  if (parts.length === 0) {
    return zh ? '情境：普通晚上' : 'Context: Regular evening';
  }

  return zh ? `情境：${parts.join('；')}` : `Context: ${parts.join('; ')}`;
}
