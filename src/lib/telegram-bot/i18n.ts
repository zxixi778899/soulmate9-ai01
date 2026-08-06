/**
 * Bilingual strings for the Telegram bot (zh / en).
 * Locale resolution: binding.locale ('zh' | 'en' | 'auto') — 'auto' follows
 * the Telegram client language_code.
 */

export type BotLocale = 'zh' | 'en';

export const STR = {
  welcomeNew: {
    zh: (name: string, companion: string) =>
      `欢迎 ${name}！这里是 SoulMate AI 官方机器人 💕\n\n` +
      `我已经为你安排了伴侣「${companion}」，直接发消息就能和她聊天。\n\n` +
      '你可以：\n' +
      '· 直接发文字/照片/语音和她聊天\n' +
      '· /photo 让她发一张新照片\n' +
      '· /girls 切换伴侣\n' +
      '· /checkin 每日签到领积分\n' +
      '· /balance 查看会员与积分',
    en: (name: string, companion: string) =>
      `Welcome, ${name}! This is the official SoulMate AI bot 💕\n\n` +
      `I've matched you with "${companion}" — just send a message to chat with her.\n\n` +
      'You can:\n' +
      '· Send text / photo / voice to chat\n' +
      '· /photo to ask her for a new picture\n' +
      '· /girls to switch companions\n' +
      '· /checkin for daily credits\n' +
      '· /balance to view membership & credits',
  },
  welcomeBack: {
    zh: (name: string) => `欢迎回来，${name} 💕 想我了没？直接发消息就能继续聊天~`,
    en: (name: string) => `Welcome back, ${name} 💕 Miss me? Just send a message to continue chatting~`,
  },
  menu: {
    zh: '选一个吧：',
    en: 'Pick one:',
  },
  btnChat: { zh: '💬 继续聊天', en: '💬 Continue chat' },
  btnPhoto: { zh: '🖼 要张照片', en: '🖼 Ask for a photo' },
  btnGirls: { zh: '👯 我的伴侣', en: '👯 My companions' },
  btnBalance: { zh: '💎 会员与积分', en: '💎 Membership & credits' },
  btnCheckin: { zh: '🎁 每日签到', en: '🎁 Daily check-in' },
  btnLang: { zh: '🌐 语言 / Language', en: '🌐 语言 / Language' },
  btnWeb: { zh: '🌐 打开网站', en: '🌐 Open website' },
  btnRefresh: { zh: '🔄 刷新', en: '🔄 Refresh' },
  btnCheckStatus: { zh: '🔍 查看进度', en: '🔍 Check status' },
  btnUpgrade: { zh: '💎 升级会员', en: '💎 Upgrade' },
  btnTopup: { zh: '💰 充值积分', en: '💰 Top up credits' },
  chatHint: {
    zh: (name: string) => `正在和「${name}」聊天，直接发消息就行～\n用 /girls 可以切换伴侣。`,
    en: (name: string) => `You're chatting with "${name}". Just send a message~\nUse /girls to switch companions.`,
  },
  switched: {
    zh: (name: string) => `好的，现在和「${name}」聊天～`,
    en: (name: string) => `Switched! You're now chatting with "${name}"~`,
  },
  girlsTitle: { zh: '我的伴侣：', en: 'My companions:' },
  girlsEmpty: {
    zh: '你还没有伴侣，正在为你安排一位…',
    en: "You don't have a companion yet — matching you with one…",
  },
  photoGenerating: {
    zh: '📸 她正在拍一张新照片，稍等 20~60 秒…',
    en: '📸 She is taking a new photo for you, wait 20–60s…',
  },
  photoPending: {
    zh: '还在生成中（GPU 排队），点下面按钮稍后再查：',
    en: 'Still generating (GPU queue). Tap below to check again:',
  },
  photoFailed: {
    zh: '照片生成失败了，请稍后再试。',
    en: 'Photo generation failed. Please try again later.',
  },
  photoNeedPrompt: {
    zh: '用法：/photo 场景描述\n例如：/photo 在海边穿白裙的自拍',
    en: 'Usage: /photo <scene description>\nExample: /photo a selfie at the beach in a white dress',
  },
  checkinOk: {
    zh: (reward: number, streak: number, balance: number) =>
      `签到成功！+${reward} 积分 🎉\n连续签到：${streak} 天\n当前积分：${balance}`,
    en: (reward: number, streak: number, balance: number) =>
      `Checked in! +${reward} credits 🎉\nStreak: ${streak} day(s)\nBalance: ${balance}`,
  },
  checkinDone: {
    zh: '今天已经签到过啦，明天再来吧～',
    en: "You've already checked in today. Come back tomorrow~",
  },
  langSet: { zh: '已切换为中文。', en: 'Language set to English.' },
  langTitle: { zh: '选择语言 / Choose language：', en: '选择语言 / Choose language:' },
  error: { zh: '出了点小问题，请稍后再试。', en: 'Something went wrong. Please try again later.' },
  notInGroup: {
    zh: '请私聊我使用机器人哦～',
    en: 'Please DM me to use the bot~',
  },
  typingFail: {
    zh: '她现在有点忙，稍等一下再发吧～',
    en: "She's a bit busy right now — try again in a moment~",
  },
  accountNote: {
    zh: '\n\n你的网站账号已自动同步，可用同一身份登录 oxmate.shop',
    en: '\n\nYour web account is synced — sign in at oxmate.shop with the same identity.',
  },
} as const;

export const TIER_NAMES: Record<string, Record<BotLocale, string>> = {
  free: { zh: '免费版', en: 'Free' },
  pro: { zh: 'Pro 会员', en: 'Pro' },
  unlimited: { zh: 'Unlimited 会员', en: 'Unlimited' },
};
