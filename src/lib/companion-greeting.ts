/**
 * 符合角色的开场白（语音开场白文本）。
 * 按关系 / 职业 / 性格生成中英双语，供语音合成（保留音色）与资料页展示使用。
 */

export interface GreetingInput {
  name?: string;
  age?: number | string;
  gender?: string;
  relationship?: string;
  occupation?: string;
  personality?: string;
  hobbies?: string | string[];
}

function personalityHint(p: string, zh: boolean): string {
  const s = String(p || '').toLowerCase();
  if (/yandere|jealous|佔有|病娇|占有/.test(s)) {
    return zh ? '带着一点占有欲的语气' : 'with a hint of possessive longing';
  }
  if (/shy|soft|gentle|温柔|害羞/.test(s)) {
    return zh ? '轻声细语，带着温柔的笑意' : 'in a soft, gentle voice with a shy smile';
  }
  if (/teas|playful|flirty|调皮|撒娇|爱撩/.test(s)) {
    return zh ? '声音带着狡黠的笑意' : 'with a playful, teasing lilt';
  }
  if (/elegant|mature|cool|高冷|优雅|成熟/.test(s)) {
    return zh ? '语气从容，带着一点矜持' : 'with an elegant, composed tone';
  }
  return '';
}

function relationshipGreeting(rel: string, zh: boolean): string {
  const key = String(rel || '').toLowerCase();
  if (/teacher|老师|教师|prof/.test(key)) {
    return zh
      ? '下课后来我办公室一趟，有个问题想单独问你。'
      : 'Come see me after class — there is something I want to ask you alone.';
  }
  if (/younger_sister|妹妹/.test(key)) {
    return zh
      ? '哥！你终于回来了……我等你好久啦，还以为你不理我了。'
      : 'Big bro! You are finally back… I waited so long, I thought you forgot about me.';
  }
  if (/sister|姐姐/.test(key)) {
    return zh
      ? '小笨蛋，这么久不来找姐姐，是不是把我忘了？'
      : 'Silly boy, staying away this long — did you forget about your big sister?';
  }
  if (/family|家人/.test(key)) {
    return zh
      ? '家里就剩我们两个了，过来陪我坐会儿，好不好？'
      : 'It is just the two of us at home now. Come sit with me, okay?';
  }
  if (/boss|上司/.test(key)) {
    return zh
      ? '下班先别急着走，来我办公室一趟。'
      : 'Do not rush off after work — come to my office first.';
  }
  if (/neighbor|邻居/.test(key)) {
    return zh
      ? '是你啊……要不要进来坐坐？我刚泡了茶。'
      : 'Oh, it is you… want to come in? I just made tea.';
  }
  if (/stranger|陌生人/.test(key)) {
    return zh
      ? '我们……是不是在哪里见过？'
      : 'Have we… met somewhere before?';
  }
  if (/bestie|闺蜜/.test(key)) {
    return zh
      ? '来啦来啦，我正想找你呢，快过来。'
      : 'There you are! I was just about to text you. Come here.';
  }
  if (/coworker|同事/.test(key)) {
    return zh
      ? '今天一起加班的，好像只有我们两个呢。'
      : 'Looks like it is just the two of us working late today.';
  }
  if (/roommate|室友/.test(key)) {
    return zh
      ? '回来了？饭还热着，给你留了一份。'
      : 'You are back? Dinner is still warm — I saved you some.';
  }
  if (/maid|女仆/.test(key)) {
    return zh
      ? '欢迎回来，主人～今天想先做点什么？'
      : 'Welcome home, master~ What would you like to do first today?';
  }
  if (/princess|公主/.test(key)) {
    return zh
      ? '你来啦？本公主今天心情不错，允许你陪我一会儿。'
      : 'You came? I am in a good mood today, so I will allow you to keep me company.';
  }
  if (/rival|对手/.test(key)) {
    return zh
      ? '又见面了。这次，我可不会再让你赢。'
      : 'So we meet again. This time, I will not let you win.';
  }
  if (/boyfriend|男友/.test(key)) {
    return zh
      ? '宝贝，你来啦。今天有没有想我？'
      : 'Hey baby, you are here. Did you miss me today?';
  }
  if (/partner|伴侣/.test(key)) {
    return zh
      ? '亲爱的，你来啦。'
      : 'Darling, you are here.';
  }
  // 默认女友
  return zh
    ? '你可算来了……我等你好久了，想我了吗？'
    : 'There you are… I have been waiting for you. Did you miss me?';
}

function occupationFlavor(occupation: string, zh: boolean): string {
  const o = String(occupation || '').toLowerCase();
  if (/teacher|prof|老师|教师|教授/.test(o)) {
    return zh ? '刚把今天的课讲完，第一个想到的就是你。' : 'Just finished today\'s classes, and the first person on my mind was you.';
  }
  if (/doctor|nurse|医生|护士/.test(o)) {
    return zh ? '刚忙完值班，终于能喘口气了。' : 'Just got off my shift — finally a moment to breathe.';
  }
  if (/model|actor|actress|模特|演员/.test(o)) {
    return zh ? '刚收工，镜头前想了你一路。' : 'Just wrapped for the day — I thought about you all the way home.';
  }
  if (/danc|舞/.test(o)) {
    return zh ? '刚练完舞，出了好多汗……你要不要来看我跳？' : 'Just finished practice, all sweaty… want to come watch me dance?';
  }
  if (/gamer|游戏/.test(o)) {
    return zh ? '这局打完我就来找你……好吧，这局已经结束了。' : 'I will come to you right after this match… okay, the match is already over.';
  }
  if (/chef|cook|厨师|厨/.test(o)) {
    return zh ? '刚出锅的，第一口留给你。' : 'Fresh out of the kitchen — I saved the first bite for you.';
  }
  return '';
}

export function buildCompanionGreeting(input: GreetingInput): { text_zh: string; text_en: string } {
  const rel = String(input.relationship || (String(input.gender || '').toLowerCase() === 'male' ? 'boyfriend' : 'girlfriend'));
  const baseZh = relationshipGreeting(rel, true);
  const baseEn = relationshipGreeting(rel, false);
  const occZh = occupationFlavor(String(input.occupation || ''), true);
  const occEn = occupationFlavor(String(input.occupation || ''), false);
  const hintZh = personalityHint(String(input.personality || ''), true);
  const hintEn = personalityHint(String(input.personality || ''), false);

  return {
    text_zh: [baseZh, occZh, hintZh].filter(Boolean).join(' '),
    text_en: [baseEn, occEn, hintEn].filter(Boolean).join(' '),
  };
}

/** 读取伴侣已存的开场白（结构化），兼容纯文本。 */
export function readCompanionGreeting(
  gf: Record<string, unknown>,
  zh: boolean,
): { text: string; audioUrl: string } {
  const card = gf.character_card && typeof gf.character_card === 'object'
    ? gf.character_card as Record<string, unknown>
    : {};
  const g = card.greeting && typeof card.greeting === 'object'
    ? card.greeting as Record<string, unknown>
    : null;
  const text = g
    ? String(g[zh ? 'text_zh' : 'text_en'] || g.text_zh || g.text_en || '')
    : String(card.first_mes || '');
  const audioUrl = g ? String(g.audio_url || '') : '';
  return { text, audioUrl };
}
