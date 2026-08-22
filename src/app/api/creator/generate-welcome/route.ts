/**
 * API: Generate welcome message based on voice timbre
 * POST /api/creator/generate-welcome
 */

import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { errorMessageFromUnknown } from '@/lib/safe-json';
import { VOICE_TIMBRES } from '@/lib/voice-timbres';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { timbreId } = body;

    if (!timbreId) {
      return Response.json({ error: 'Missing timbreId' }, { status: 400 });
    }

    // Get the selected timbre
    const timbre = VOICE_TIMBRES.find(t => t.id === timbreId);
    if (!timbre) {
      return Response.json({ error: 'Invalid timbre' }, { status: 400 });
    }

    // Generate a welcome message based on the timbre style
    const locale = req.headers.get('accept-language')?.split(',')[0] || 'en';
    
    // AI-generated welcome messages for each timbre
    const welcomeMessages: Record<string, { en: string; zh: string }> = {
      'soft-whisper': {
        en: "Hey... I've been waiting for you. Come closer...",
        zh: "嘿……我一直在等你。过来一点……",
      },
      'sweet-cute': {
        en: "Yay! You're here! I missed you so much! 💕",
        zh: "太好啦！你来了！我好想你呀！💕",
      },
      'cool-confident': {
        en: "You made it. I knew you would.",
        zh: "你来了。我就知道你会来。",
      },
      'warm-caring': {
        en: "Welcome home, darling. Let me take care of you today.",
        zh: "欢迎回家，亲爱的。今天就让我好好照顾你吧。",
      },
      'sultry-velvet': {
        en: "Finally... I've been thinking about you all day.",
        zh: "终于……我今天一直在想你。",
      },
      'bright-cheerful': {
        en: "Hi hi! Guess what? My day just got so much better now that you're here!",
        zh: "嗨嗨！猜猜怎么着？你一来我的一天就变得超级棒！",
      },
      'elegant-mature': {
        en: "It's wonderful to see you again. Do tell me, how has your day been?",
        zh: "很高兴再次见到你。请告诉我，今天过得还好吗？",
      },
      'tsundere-sharp': {
        en: "Hmph! You're late. Well, since you're here... maybe we can talk.",
        zh: "哼！你迟到了。不过既然来了……或许可以聊聊天。",
      },
      'dreamy-ethereal': {
        en: "*gently smiles* I feel like our paths were meant to cross again...",
        zh: "*轻轻微笑* 我感觉我们的相遇，或许是命中注定呢……",
      },
      'asmr-intimate': {
        en: "*leans in close* Shh... let me whisper something special just for you.",
        zh: "*靠近耳边* 嘘……让我悄悄告诉你一个只属于你的秘密。",
      },
    };

    const message = locale === 'zh' ? 
      (welcomeMessages[timbreId]?.zh || welcomeMessages[timbreId]?.en) :
      welcomeMessages[timbreId]?.en;

    logger.info('[welcome-gen] Generated message', {
      userId: user?.user?.id ?? 'unknown',
      timbreId,
      locale,
    });

    return Response.json({ message });
  } catch (error) {
    logger.error('[welcome-gen] Error generating welcome message', { error });
    return Response.json({ error: errorMessageFromUnknown(error, 'Failed to generate welcome message') }, { status: 500 });
  }
}
