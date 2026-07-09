'use client';
import { useTranslation } from '@/lib/i18n/context';
import { formatBubbleTime, dateGroupLabel, dayKey } from '@/lib/chat-utils';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { motion } from 'motion/react';

import { authedFetch } from '@/lib/supabase';
import { useEffect, useState, useRef, use, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IntimacyProgress } from '@/components/IntimacyProgress';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Loader2,
  Send,
  Gift,
  Shirt,
  Image as ImageIcon,
  Mic,
  Sparkles,
  Heart,
  ArrowLeft,
  Check,
  CheckCheck,
  BrainCircuit,
  ChevronUp,
  Brain,
  Plus,
  ChevronDown,
  X,
  Crown,
} from 'lucide-react';
import { INTIMACY_LEVELS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { useMembership } from '@/hooks/useMembership';
import { toast } from 'sonner';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  is_proactive?: boolean;
  media_url?: string | null;
  status?: 'sending' | 'sent' | 'read' | 'failed';
};

type Girlfriend = {
  id: string;
  name: string;
  avatar_url: string | null;
  personality: string | null;
  appearance_race?: string;
  appearance_hair?: string;
  appearance_hair_color?: string;
  appearance_eyes?: string;
  appearance_body?: string;
  appearance_style?: string;
};

type IntimacyData = {
  score: number;
  level: number;
  daily_score_gained: number;
};

type OutfitItem = {
  id: string;
  name: string;
  emoji: string;
  category: string;
  tier: string;
  description: string;
  intimacy_boost: number;
};

type MemoryItem = {
  id: string;
  content: string;
  type: string;
  category: string;
  created_at: string;
};

const GIFTS = [
  { id: 'rose', name: 'Red Rose', emoji: '\uD83C\uDF39', boost: 3, desc: 'A classic romantic gesture' },
  { id: 'chocolate', name: 'Chocolate Box', emoji: '\uD83C\uDF6B', boost: 5, desc: 'Sweet and thoughtful' },
  { id: 'necklace', name: 'Silver Necklace', emoji: '\uD83D\uDCFF', boost: 8, desc: 'Elegant and memorable' },
  { id: 'ring', name: 'Promise Ring', emoji: '\uD83D\uDC8D', boost: 15, desc: 'A deep commitment' },
] as const;

const MOODS = ['romantic', 'playful', 'sweet', 'passionate', 'cozy', 'cheerful'];
const POSES = ['sitting', 'standing', 'lying_down', 'walking', 'dancing', 'close_up'];
const ENVS = ['bedroom', 'beach', 'garden', 'city', 'cozy_room', 'outdoor'];

// (helpers moved to @/lib/chat-utils)

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useTranslation();
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  // Data
  const [girlfriend, setGirlfriend] = useState<Girlfriend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [intimacy, setIntimacy] = useState<IntimacyData>({ score: 0, level: 1, daily_score_gained: 0 });
  const [outfits, setOutfits] = useState<OutfitItem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);

  // Input
  const [input, setInput] = useState('');

  // Loading / pagination
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // UI panels
  const [showGiftDialog, setShowGiftDialog] = useState(false);
  const [showWardrobeDialog, setShowWardrobeDialog] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showLightbox, setShowLightbox] = useState<string | null>(null);
  const [selectedOutfit, setSelectedOutfit] = useState<string | null>(null);

  // Presets (for chat & selfie)
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedPose, setSelectedPose] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  // Membership & usage banner
  const membership = useMembership();
  const [usageBannerDismissed, setUsageBannerDismissed] = useState(false);

  // Scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    loadData();
    authedFetch('/api/outfits')
      .then(r => r.json())
      .then(d => setOutfits(d.outfits || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [gfRes, msgRes, intRes] = await Promise.all([
        authedFetch('/api/girlfriends'),
        authedFetch(`/api/chat/${id}`),
        authedFetch('/api/intimacy'),
      ]);

      const gfData = await gfRes.json();
      const msgData = await msgRes.json();
      const intData = await intRes.json();

      const gf = (gfData.girlfriends || []).find((g: Girlfriend) => g.id === id);
      setGirlfriend(gf);
      setMessages(msgData.messages || []);

      const intScore = (intData.scores || []).find((s: { girlfriend_id: string; score: number; level: number; daily_score_gained?: number }) => s.girlfriend_id === id);
      if (intScore) {
        setIntimacy({
          score: intScore.score,
          level: intScore.level,
          daily_score_gained: intScore.daily_score_gained || 0,
        });
      }
    } catch (err) {
      logger.error('Failed to load chat:', { data: err });
    }
    setIsLoading(false);
  };

  const loadHistory = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await authedFetch(`/api/chat/${id}?page=${nextPage}&limit=30`);
      const data = await res.json();
      if (data.messages?.length) {
        setMessages(prev => [...data.messages, ...prev]);
        setPage(nextPage);
      }
      if (!data.messages?.length || data.messages.length < 30) {
        setHasMore(false);
      }
    } catch {}
    setLoadingMore(false);
  };

  const loadMemories = async () => {
    setLoadingMemories(true);
    try {
      const res = await authedFetch(`/api/memories?girlfriend_id=${id}`);
      const data = await res.json();
      setMemories(data.memories || []);
    } catch {}
    setLoadingMemories(false);
  };

  useEffect(() => {
    if (showMemories) loadMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMemories]);

  // Proactive polling
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await authedFetch('/api/proactive/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ girlfriend_id: id }),
        });
        const data = await res.json();
        if (data.message) {
          setMessages(prev => [...prev, {
            id: `proactive-${Date.now()}`,
            role: 'assistant',
            content: data.message,
            created_at: new Date().toISOString(),
            is_proactive: true,
          } as Message]);
        }
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [id]);

  // Auto scroll to bottom on new messages (if user near bottom)
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isTyping, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(dist > 240);
    setAutoScroll(dist < 80);
  }, []);

  const scrollToBottom = () => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      setAutoScroll(true);
    }
  };

  const generateSelfie = async () => {
    setShowAttachments(false);
    setIsGenerating(true);
    try {
      const res = await authedFetch('/api/chat/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          girlfriend_id: id,
          mood: selectedMood,
          pose: selectedPose,
          environment: selectedEnvironment,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate image');
      const data = await res.json();
      if (data.image_url) {
        const newMsg: Message = {
          id: `selfie-${Date.now()}`,
          role: 'assistant',
          content: "Here's a selfie for you ",
          created_at: new Date().toISOString(),
          media_url: data.image_url,
        };
        setMessages(prev => [...prev, newMsg]);
      }
    } catch (err) {
      logger.error('Generate selfie error:', { data: err });
    }
    setIsGenerating(false);
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isSending) return;

    setInput('');
    setIsSending(true);
    setAutoScroll(true);

    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      status: 'sending',
    }]);

    try {
      const res = await authedFetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          girlfriend_id: id,
          mood: selectedMood,
          pose: selectedPose,
          environment: selectedEnvironment,
        }),
      });

      if (!res.ok) throw new Error('Failed to send message');

      // Mark user message as sent
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m));

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      setIsTyping(true);

      const assistId = `assist-${Date.now()}`;
      let assistInserted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          if (line === 'data: [DONE]') continue;
          if (!line.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(line.slice(6));
            if (json.error) {
              logger.error('Stream error:', { data: json.error });
              continue;
            }
            fullContent += json.content || '';
            if (!assistInserted && fullContent) {
              assistInserted = true;
              setIsTyping(false);
              setMessages(prev => [...prev, {
                id: assistId,
                role: 'assistant',
                content: fullContent,
                created_at: new Date().toISOString(),
              }]);
            } else if (assistInserted) {
              setMessages(prev => prev.map(m =>
                m.id === assistId ? { ...m, content: fullContent } : m
              ));
            }
          } catch {}
        }
      }
      setIsTyping(false);
      // Mark user message as read once assistant responded
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'read' } : m));

      // Update intimacy
      const intRes = await authedFetch('/api/intimacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ girlfriend_id: id, message_type: 'normal' }),
      });
      const intData = await intRes.json();
      if (intData.score !== undefined) {
        setIntimacy(prev => ({
          ...prev,
          score: intData.score,
          level: intData.level,
          daily_score_gained: (prev.daily_score_gained || 0) + (intData.gained || 0),
        }));
      }

      // Check achievements (fire and forget)
      authedFetch('/api/v2/user/achievements').then(r => r.json()).then(data => {
        const newUnlocks = (data.achievements || []).filter((a: any) => a.user_progress?.unlocked && !a.user_progress?.reward_claimed);
        if (newUnlocks.length > 0) {
          toast.success(`🏆 Achievement Unlocked: ${newUnlocks[0].name}!`, {
            description: `+${newUnlocks[0].reward_tokens} tokens`,
            duration: 4000,
          });
        }
      }).catch(() => {});
    } catch (err) {
      logger.error('Send error:', { data: err });
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      setIsTyping(false);
    }
    setIsSending(false);
  };

  const handleSendGift = (gift: typeof GIFTS[number]) => {
    setShowGiftDialog(false);
    setShowAttachments(false);
    void sendMessage(`*sends a gift: ${gift.emoji} ${gift.name}*`);
  };

  const handleEquipOutfit = (outfitId: string) => {
    setSelectedOutfit(outfitId === selectedOutfit ? null : outfitId);
    const outfit = outfits.find(o => o.id === outfitId);
    if (outfit && outfitId !== selectedOutfit) {
      setMessages(prev => [...prev, {
        id: `outfit-${Date.now()}`,
        role: 'assistant',
        content: `${girlfriend?.name ?? 'She'} changed into ${outfit.emoji} ${outfit.name}!`,
        created_at: new Date().toISOString(),
      }]);
    }
    setShowWardrobeDialog(false);
    setShowAttachments(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const getLevelInfo = (score: number): typeof INTIMACY_LEVELS[number] => {
    let level: typeof INTIMACY_LEVELS[number] = INTIMACY_LEVELS[0];
    for (const l of INTIMACY_LEVELS) {
      if (score >= l.min_score) level = l;
    }
    return level;
  };

  const FEATURE_UNLOCKS: Record<number, string[]> = {
    1: ['basic_chat', 'view_profile'],
    2: ['personalized_greetings', 'send_gifts'],
    3: ['nsfw_chat', 'advanced_memories'],
    4: ['wardrobe_access', 'character_depth'],
    5: ['exclusive_outfits', 'deep_roleplay'],
    6: ['voice_messages', 'custom_stories', 'special_title'],
  };

  function computeProgress(score: number, level: number): number {
    if (level >= INTIMACY_LEVELS.length) return 100;
    const curMin = (INTIMACY_LEVELS[level - 1] as any)?.min_score || 0;
    const nextMin = (INTIMACY_LEVELS[level] as any)?.min_score || curMin + 100;
    return Math.min(100, Math.round((score - curMin) / (nextMin - curMin) * 100)) || 0;
  }

  function getNextLevelTitle(level: number): string | undefined {
    if (level >= INTIMACY_LEVELS.length) return undefined;
    return (INTIMACY_LEVELS[level] as any)?.title;
  }

  const levelInfo = getLevelInfo(intimacy.score);

  // Group messages by day + consecutive-merge (for IM look)
  const renderRows = useMemo(() => {
    type Row =
      | { type: 'date'; key: string; label: string }
      | { type: 'msg'; key: string; msg: Message; showAvatar: boolean; merged: boolean };
    const out: Row[] = [];
    let lastDay = '';
    let lastRole: 'user' | 'assistant' | null = null;
    let lastTime = 0;
    messages.forEach((m, i) => {
      const dk = dayKey(m.created_at);
      if (dk !== lastDay) {
        out.push({ type: 'date', key: `date-${dk}-${i}`, label: dateGroupLabel(m.created_at) });
        lastDay = dk;
        lastRole = null;
        lastTime = 0;
      }
      const ts = new Date(m.created_at).getTime();
      const merged = lastRole === m.role && Math.abs(ts - lastTime) < 3 * 60 * 1000;
      // assistant avatar appears on first of a group
      const showAvatar = m.role === 'assistant' && !merged;
      out.push({ type: 'msg', key: m.id, msg: m, showAvatar, merged });
      lastRole = m.role;
      lastTime = ts;
    });
    return out;
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]" />
      </div>
    );
  }

  if (!girlfriend) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="text-center">
          <p className="text-[#8B8BA3]">{t('chat.companionNotFound') || 'Companion not found'}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/messages')}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* === PLACEHOLDER: AppBar / Messages / Input / Sheets === */}
      <ChatAppBar
        girlfriend={girlfriend}
        levelInfo={levelInfo}
        intimacy={intimacy}
        isTyping={isTyping}
        onBack={() => router.push('/messages')}
        onSelfie={generateSelfie}
        isGenerating={isGenerating}
        onMemories={() => setShowMemories(true)}
      />

      {/* Intimacy Progress Bar */}
      <div className="px-2 sm:px-4 pt-1">
        <IntimacyProgress
          currentLevel={levelInfo.level}
          progressPercent={computeProgress(intimacy.score, levelInfo.level)}
          intimacyScore={Math.round(intimacy.score)}
          nextLevelName={getNextLevelTitle(levelInfo.level)}
          unlockedFeatures={FEATURE_UNLOCKS[levelInfo.level] || []}
        />
      </div>

      <ChatStream
        scrollRef={scrollRef}
        onScroll={handleScroll}
        girlfriend={girlfriend}
        user={user}
        rows={renderRows}
        isTyping={isTyping}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadHistory={loadHistory}
        levelColor={levelInfo.color}
        onOpenImage={setShowLightbox}
        bottomRef={bottomRef}
      />

      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 bottom-28 z-20 h-10 w-10 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/[0.10] text-[#F0F0F5] flex items-center justify-center shadow-lg active:scale-95 transition-all"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      {/* Usage warning banner for free users at 80% daily limit */}
      {!usageBannerDismissed && membership.tier === 'free' && membership.todayMessagesCount >= 40 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mx-3 sm:mx-6 mb-1 flex items-center gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.10] px-4 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#F0F0F5]/90 leading-snug">
              {t('chat.usageWarning')
                .replace('{count}', String(membership.todayMessagesCount))
                .replace('{limit}', '50')}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => router.push('/shop')}
            className="shrink-0 h-7 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] text-white text-[11px] font-semibold px-3 shadow-[0_2px_10px_rgba(255,45,120,0.35)] hover:opacity-90 active:scale-95 transition-all border-0"
          >
            <Crown className="h-3 w-3 mr-1" />
            Upgrade
          </Button>
          <button
            onClick={() => setUsageBannerDismissed(true)}
            className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.08] active:scale-95 transition-all"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}

      <ChatInputBar
        input={input}
        setInput={setInput}
        onSend={() => sendMessage()}
        onKeyDown={handleKeyDown}
        isSending={isSending}
        placeholder={`Message ${girlfriend.name}`}
        onOpenAttachments={() => setShowAttachments(true)}
        showPresets={showPresets}
        togglePresets={() => setShowPresets(s => !s)}
        selectedMood={selectedMood}
        setSelectedMood={setSelectedMood}
        selectedPose={selectedPose}
        setSelectedPose={setSelectedPose}
        selectedEnvironment={selectedEnvironment}
        setSelectedEnvironment={setSelectedEnvironment}
      />

      {/* Quick Reply Suggestions */}
      {!isSending && !isTyping && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-hide">
          {[
            { emoji: '❤️', text: 'I miss you', msg: 'I miss you so much right now...' },
            { emoji: '😘', text: 'You\'re beautiful', msg: 'You look so beautiful today' },
            { emoji: '💭', text: 'Tell me a story', msg: 'Tell me a story about us' },
            { emoji: '🤗', text: 'Hug me', msg: '*hugs you tightly*' },
            { emoji: '🌙', text: 'Goodnight', msg: 'Goodnight babe, sweet dreams 💕' },
            { emoji: '🔥', text: 'What are you wearing?', msg: 'What are you wearing right now?' },
          ].map((suggestion) => (
            <button
              key={suggestion.text}
              onClick={() => sendMessage(suggestion.msg)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-white/[0.04] border border-white/[0.08] text-[#8B8BA3] hover:text-white hover:bg-white/[0.08] hover:border-[#FF2D78]/30 active:scale-95 transition-all"
            >
              <span>{suggestion.emoji}</span>
              {suggestion.text}
            </button>
          ))}
        </div>
      )}

      {/* Attachment Sheet */}
      <AttachmentsSheet
        open={showAttachments}
        onOpenChange={setShowAttachments}
        onGift={() => { setShowAttachments(false); setShowGiftDialog(true); }}
        onWardrobe={() => { setShowAttachments(false); setShowWardrobeDialog(true); }}
        onSelfie={generateSelfie}
        onMemories={() => { setShowAttachments(false); setShowMemories(true); }}
        onPresets={() => { setShowAttachments(false); setShowPresets(true); }}
        isGenerating={isGenerating}
      />

      {/* Memories Sheet */}
      <Sheet open={showMemories} onOpenChange={setShowMemories}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-sm bg-[#0E0E1A]/95 backdrop-blur-2xl border-l border-white/[0.08]"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base font-display">
              <BrainCircuit className="h-4 w-4 text-[#FF2D78]" />
              Memories with {girlfriend.name}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 overflow-y-auto max-h-[calc(100vh-8rem)] pb-8 pr-1">
            {loadingMemories ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[#8B8BA3]" />
              </div>
            ) : memories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Heart className="h-8 w-8 text-[#8B8BA3]/30 mb-3" />
                <p className="text-xs text-[#8B8BA3]">
                  {t('chat.noMemoriesYet') || 'No memories yet. Start chatting and she will remember!'}
                </p>
              </div>
            ) : (
              memories.map((mem) => (
                <div
                  key={mem.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 backdrop-blur-md"
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-medium text-[#FF6BA6]/80 uppercase tracking-wider">
                      {mem.category}
                    </span>
                    <span className="text-[10px] text-[#8B8BA3]">
                      {new Date(mem.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-[#F0F0F5]/90 leading-relaxed">{mem.content}</p>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Gift Dialog */}
      <Dialog open={showGiftDialog} onOpenChange={setShowGiftDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Send a Gift </DialogTitle>
            <DialogDescription>
              Choose a gift to send to {girlfriend.name}. Gifts boost intimacy!
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2.5 py-2">
            {GIFTS.map((gift) => (
              <button
                key={gift.id}
                onClick={() => handleSendGift(gift)}
                className="flex items-center gap-4 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] hover:border-[#FF2D78]/30 transition-all text-left active:scale-[0.98]"
              >
                <span className="text-3xl shrink-0">{gift.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#F0F0F5]">{gift.name}</div>
                  <div className="text-xs text-[#8B8BA3] mt-0.5">{gift.desc}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-bold text-[#FF6BA6] tabular-nums">+{gift.boost}</div>
                  <div className="text-[10px] text-[#8B8BA3]">intimacy</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wardrobe Dialog */}
      <Dialog open={showWardrobeDialog} onOpenChange={setShowWardrobeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{t('chat.wardrobe') || 'Wardrobe'} </DialogTitle>
            <DialogDescription>Dress up {girlfriend.name} with a new outfit.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
            {outfits.map((outfit) => (
              <button
                key={outfit.id}
                onClick={() => handleEquipOutfit(outfit.id)}
                className={`relative flex flex-col items-center gap-1.5 p-4 rounded-2xl border transition-all active:scale-[0.97] ${
                  selectedOutfit === outfit.id
                    ? 'border-[#FF2D78]/50 bg-[#FF2D78]/10 ring-1 ring-[#FF2D78]/20 shadow-[0_0_18px_rgba(255,45,120,0.18)]'
                    : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                <span className="text-4xl">{outfit.emoji}</span>
                <div className="text-xs font-semibold text-center text-[#F0F0F5]">{outfit.name}</div>
                <span className="text-[10px] text-[#8B8BA3] capitalize">{outfit.category}</span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor:
                      outfit.tier === 'free' ? 'rgba(139,139,163,0.18)' :
                      outfit.tier === 'premium' ? 'rgba(192,38,211,0.18)' :
                      'rgba(255,45,120,0.18)',
                    color:
                      outfit.tier === 'free' ? '#8B8BA3' :
                      outfit.tier === 'premium' ? '#C026D3' :
                      '#FF6BA6',
                  }}
                >
                  {outfit.tier}
                </span>
                {selectedOutfit === outfit.id && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#FF2D78] flex items-center justify-center shadow-[0_0_12px_rgba(255,45,120,0.6)]">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Lightbox */}
      {showLightbox && (
        <button
          onClick={() => setShowLightbox(null)}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200"
          aria-label="Close image"
        >
          <button
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white"
            aria-label="Close"
            onClick={(e) => { e.stopPropagation(); setShowLightbox(null); }}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={showLightbox}
            alt="Preview"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      )}
    </div>
  );
}

/* ============================================================= */
/*           Sub-components (rendered as placeholders below)     */
/* ============================================================= */

// Placeholder implementations  will be replaced via edit_file in next steps.
type LevelInfo = typeof INTIMACY_LEVELS[number];

function ChatAppBar(props: {
  girlfriend: Girlfriend;
  levelInfo: LevelInfo;
  intimacy: IntimacyData;
  isTyping: boolean;
  onBack: () => void;
  onSelfie: () => void;
  isGenerating: boolean;
  onMemories: () => void;
}) {
  const { girlfriend, levelInfo, intimacy, isTyping, onBack, onSelfie, isGenerating, onMemories } = props;
  return (
    <header className="sticky top-0 z-30 backdrop-blur-2xl bg-[#07070F]/75 border-b border-white/[0.06]">
      <div className="flex items-center gap-2 px-2 sm:px-4 py-2.5">
        <button
          onClick={onBack}
          className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[#F0F0F5] hover:bg-white/[0.06] active:scale-95 active:bg-white/[0.10] transition-all"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="relative shrink-0">
          <Avatar className="h-10 w-10 ring-1 ring-white/[0.08]">
            {girlfriend.avatar_url ? (
              <AvatarImage src={girlfriend.avatar_url} alt={girlfriend.name} className="object-cover" />
            ) : (
              <AvatarFallback className="bg-gradient-to-br from-[#FF2D78]/30 to-[#C026D3]/20 text-[#FF6BA6] text-sm font-semibold">
                {girlfriend.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <span
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#07070F] transition-colors ${
              isTyping ? 'bg-[#FF6BA6] animate-pulse' : 'bg-emerald-400'
            }`}
            aria-hidden
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-[#F0F0F5] truncate">{girlfriend.name}</h2>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0"
              style={{ backgroundColor: levelInfo.color + '22', color: levelInfo.color }}
            >
              Lv.{intimacy.level}
            </span>
          </div>
          <div className="text-[11px] mt-0.5 truncate">
            {isTyping ? (
              <span className="text-[#FF6BA6] font-medium animate-pulse">typing</span>
            ) : (
              <span className="text-[#8B8BA3]">
                {levelInfo.title}  <span className="font-mono tabular-nums">{Math.round(intimacy.score)}pts</span>
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onSelfie}
          disabled={isGenerating}
          className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium text-[#F0F0F5] bg-white/[0.04] border border-white/[0.08] hover:border-[#FF2D78]/30 hover:bg-[#FF2D78]/8 active:scale-95 disabled:opacity-50 transition-all"
          title="Generate selfie"
        >
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          <span>Selfie</span>
        </button>
        <button
          onClick={onMemories}
          className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[#8B8BA3] hover:text-[#FF6BA6] hover:bg-white/[0.06] active:scale-95 transition-all"
          aria-label="Memories"
        >
          <Brain className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}

function ChatStream(props: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  girlfriend: Girlfriend;
  user: ReturnType<typeof useAuth>['user'];
  rows: ReadonlyArray<
    | { type: 'date'; key: string; label: string }
    | { type: 'msg'; key: string; msg: Message; showAvatar: boolean; merged: boolean }
  >;
  isTyping: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadHistory: () => void;
  levelColor: string;
  onOpenImage: (url: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  const {
    scrollRef, onScroll, girlfriend, rows, isTyping,
    hasMore, loadingMore, onLoadHistory, levelColor, onOpenImage, bottomRef,
  } = props;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative flex-1 overflow-y-auto px-3 sm:px-6 pt-3 pb-2"
    >
      {/* portrait halo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-[28%] -translate-x-1/2 -translate-y-1/2 w-[560px] h-[640px] opacity-[0.05]"
          style={{
            background: `radial-gradient(ellipse at 50% 40%, ${levelColor} 0%, transparent 60%)`,
            filter: 'blur(48px)',
          }}
        />
      </div>

      <div className="relative max-w-3xl mx-auto">
        {hasMore && rows.length > 0 && (
          <div className="flex justify-center py-1">
            <button
              onClick={onLoadHistory}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 text-[11px] text-[#8B8BA3] hover:text-[#F0F0F5] h-7 px-3 rounded-full bg-white/[0.04] backdrop-blur-md border border-white/[0.06] active:scale-95 transition-all"
            >
              {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              Load earlier messages
            </button>
          </div>
        )}

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#FF2D78]/20 to-[#C026D3]/10 ring-1 ring-[#FF2D78]/20 flex items-center justify-center mb-4">
              <Heart className="h-6 w-6 text-[#FF6BA6]" />
            </div>
            <p className="font-display text-base text-[#F0F0F5]">Say hi to {girlfriend.name}</p>
            <p className="text-xs text-[#8B8BA3] mt-1.5 max-w-xs">
              Send your first message and start building your story together.
            </p>
          </div>
        )}

        <div className="flex flex-col">
          {rows.map((row) => {
            if (row.type === 'date') {
              return (
                <div key={row.key} className="flex justify-center my-3">
                  <span className="text-[10px] font-medium tracking-wider uppercase text-[#8B8BA3] bg-white/[0.04] backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/[0.04]">
                    {row.label}
                  </span>
                </div>
              );
            }
            const { msg, showAvatar, merged } = row;
            const isUser = msg.role === 'user';
            const isAssistant = !isUser;
            const isOutfit = msg.id.startsWith('outfit-');
            const isSending = msg.status === 'sending';
            const isFailed = msg.status === 'failed';

            return (
              <motion.div
                key={row.key}
                initial={{ opacity: 0, y: 8, x: isUser ? 12 : -12 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={`flex gap-2 items-end ${isUser ? 'flex-row-reverse' : ''} ${merged ? 'mt-0.5' : 'mt-3'}`}
              >
                {isAssistant && (
                  <div className="w-8 shrink-0">
                    {showAvatar ? (
                      <Avatar className="h-8 w-8 ring-1 ring-white/[0.05]">
                        {girlfriend.avatar_url ? (
                          <AvatarImage src={girlfriend.avatar_url} alt={girlfriend.name} className="object-cover" />
                        ) : (
                          <AvatarFallback className="bg-[#FF2D78]/15 text-[#FF6BA6] text-[10px]">
                            {girlfriend.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    ) : null}
                  </div>
                )}

                <div className={`max-w-[78%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`relative px-3.5 py-2 text-[14px] leading-relaxed shadow-sm break-words ${
                      isUser
                        ? `bg-gradient-to-br from-[#FF2D78] to-[#C026D3] text-white rounded-2xl ${merged ? 'rounded-tr-2xl' : 'rounded-tr-md'} shadow-[0_4px_14px_rgba(255,45,120,0.25)] ${isSending ? 'opacity-70' : ''} ${isFailed ? 'from-[#7a1a35] to-[#5c1827]' : ''}`
                        : msg.is_proactive
                        ? `bg-white/[0.06] backdrop-blur-md border border-white/[0.08] border-l-2 border-l-[#FF2D78] text-[#F0F0F5] rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                        : isOutfit
                        ? `bg-[#FF2D78]/8 backdrop-blur-md border border-[#FF2D78]/15 text-[#F0F0F5] italic rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                        : `bg-white/[0.06] backdrop-blur-md border border-white/[0.08] text-[#F0F0F5] rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                    }`}
                  >
                    {msg.content && isUser && (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                    {msg.content && !isUser && (
                      <ChatMarkdown content={msg.content} />
                    )}
                    {!msg.content && isAssistant && (
                      <span className="inline-flex gap-1 py-0.5">
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </span>
                    )}
                    {msg.media_url && (
                      <button
                        onClick={() => onOpenImage(msg.media_url!)}
                        className="block mt-2 rounded-xl overflow-hidden border border-white/[0.08] max-w-full active:scale-[0.98] transition-transform"
                      >
                        <img
                          src={msg.media_url}
                          alt="Image"
                          className="w-full h-auto max-h-[280px] object-cover"
                          loading="lazy"
                        />
                      </button>
                    )}
                  </div>

                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] text-[#8B8BA3] font-mono tabular-nums">
                      {formatBubbleTime(msg.created_at)}
                    </span>
                    {isUser && msg.status === 'sending' && (
                      <Loader2 className="h-3 w-3 animate-spin text-[#8B8BA3]" />
                    )}
                    {isUser && msg.status === 'sent' && (
                      <Check className="h-3 w-3 text-[#8B8BA3]" />
                    )}
                    {isUser && msg.status === 'read' && (
                      <CheckCheck className="h-3 w-3 text-[#FF6BA6]" />
                    )}
                    {isUser && msg.status === 'failed' && (
                      <span className="text-[10px] text-red-400 font-medium">Failed</span>
                    )}
                    {msg.is_proactive && (
                      <span className="text-[10px] text-[#FF6BA6]/70 flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" />
                        proactive
                      </span>
                    )}
                    {isOutfit && (
                      <span className="text-[10px] text-[#FF6BA6]/70 flex items-center gap-0.5">
                        <Shirt className="h-2.5 w-2.5" />
                        new outfit
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {isTyping && (
            <div className="flex gap-2 items-end mt-3">
              <div className="w-8 shrink-0">
                <Avatar className="h-8 w-8 ring-1 ring-white/[0.05]">
                  {girlfriend.avatar_url ? (
                    <AvatarImage src={girlfriend.avatar_url} alt={girlfriend.name} className="object-cover" />
                  ) : (
                    <AvatarFallback className="bg-[#FF2D78]/15 text-[#FF6BA6] text-[10px]">
                      {girlfriend.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
              <div className="px-3.5 py-2.5 bg-white/[0.06] backdrop-blur-md border border-white/[0.08] rounded-2xl rounded-tl-md">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function ChatInputBar(props: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isSending: boolean;
  placeholder: string;
  onOpenAttachments: () => void;
  showPresets: boolean;
  togglePresets: () => void;
  selectedMood: string | null;
  setSelectedMood: (v: string | null) => void;
  selectedPose: string | null;
  setSelectedPose: (v: string | null) => void;
  selectedEnvironment: string | null;
  setSelectedEnvironment: (v: string | null) => void;
}) {
  const {
    input, setInput, onSend, onKeyDown, isSending, placeholder,
    onOpenAttachments, showPresets, togglePresets,
    selectedMood, setSelectedMood,
    selectedPose, setSelectedPose,
    selectedEnvironment, setSelectedEnvironment,
  } = props;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hasText = input.trim().length > 0;

  // Auto-resize textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  return (
    <div className="sticky bottom-0 z-20 backdrop-blur-2xl bg-[#07070F]/80 border-t border-white/[0.06]">
      {/* Presets row (collapsible) */}
      {showPresets && (
        <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-2 pb-1.5 space-y-1.5">
          {[
            { label: 'MOOD', items: MOODS, selected: selectedMood, set: setSelectedMood },
            { label: 'POSE', items: POSES, selected: selectedPose, set: setSelectedPose },
            { label: 'ENV', items: ENVS, selected: selectedEnvironment, set: setSelectedEnvironment },
          ].map(({ label, items, selected, set }) => (
            <div key={label} className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold text-[#8B8BA3] uppercase tracking-wider mr-0.5 w-9 shrink-0">
                {label}
              </span>
              {items.map(it => (
                <button
                  key={it}
                  onClick={() => set(selected === it ? null : it)}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-all active:scale-95 ${
                    selected === it
                      ? 'bg-[#FF2D78]/20 border-[#FF2D78]/50 text-[#FF6BA6] shadow-[0_0_10px_rgba(255,45,120,0.2)]'
                      : 'bg-white/[0.03] border-white/[0.06] text-[#8B8BA3] hover:border-white/[0.12]'
                  }`}
                >
                  {it.replace('_', ' ')}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-2 sm:px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <div className="flex items-end gap-1.5">
          {/* + attachment button */}
          <button
            onClick={onOpenAttachments}
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[#8B8BA3] hover:text-[#FF6BA6] hover:bg-white/[0.06] active:scale-95 active:bg-white/[0.10] transition-all"
            aria-label="More"
          >
            <Plus className="h-5 w-5" />
          </button>

          {/* presets toggle */}
          <button
            onClick={togglePresets}
            className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center hover:bg-white/[0.06] active:scale-95 transition-all ${
              showPresets ? 'text-[#FF6BA6] bg-white/[0.04]' : 'text-[#8B8BA3]'
            }`}
            aria-label="Presets"
            title="Mood / Pose / Env"
          >
            <Sparkles className="h-[18px] w-[18px]" />
          </button>

          {/* input */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              className="w-full resize-none rounded-2xl bg-white/[0.06] border border-white/[0.10] px-4 py-2.5 text-base md:text-sm text-[#F0F0F5] placeholder:text-[#8B8BA3]/60 focus:border-[#FF2D78]/40 focus:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-[#FF2D78]/20 transition-all leading-snug min-h-[40px] max-h-[120px]"
            />
          </div>

          {/* dynamic mic/send */}
          {hasText ? (
            <button
              onClick={onSend}
              disabled={isSending}
              className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-[#FF2D78] to-[#C026D3] text-white flex items-center justify-center shadow-[0_4px_18px_rgba(255,45,120,0.45)] active:scale-95 disabled:opacity-60 transition-all"
              aria-label="Send"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          ) : (
            <button
              className="h-10 w-10 shrink-0 rounded-full bg-white/[0.04] border border-white/[0.08] text-[#8B8BA3] hover:text-[#FF6BA6] hover:border-[#FF6BA6]/30 flex items-center justify-center active:scale-95 transition-all"
              aria-label="Voice (coming soon)"
              title="Voice (coming soon)"
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentsSheet(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGift: () => void;
  onWardrobe: () => void;
  onSelfie: () => void;
  onMemories: () => void;
  onPresets: () => void;
  isGenerating: boolean;
}) {
  const { open, onOpenChange, onGift, onWardrobe, onSelfie, onMemories, onPresets, isGenerating } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl bg-[#0E0E1A]/95 backdrop-blur-2xl border-t border-white/[0.10] max-h-[60vh]"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-lg text-center">Add to chat</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-4 gap-3 mt-4 pb-4">
          {[
            { icon: <Gift className="h-6 w-6" />, label: 'Gift', onClick: onGift, color: '#FF2D78' },
            { icon: <Shirt className="h-6 w-6" />, label: 'Outfit', onClick: onWardrobe, color: '#C026D3' },
            {
              icon: isGenerating ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />,
              label: 'Selfie', onClick: onSelfie, color: '#FF6BA6',
            },
            { icon: <Brain className="h-6 w-6" />, label: 'Memories', onClick: onMemories, color: '#FF2D78' },
            { icon: <Sparkles className="h-6 w-6" />, label: 'Presets', onClick: onPresets, color: '#C026D3' },
          ].map((it) => (
            <button
              key={it.label}
              onClick={it.onClick}
              disabled={it.label === 'Selfie' && isGenerating}
              className="flex flex-col items-center gap-1.5 active:scale-95 disabled:opacity-50 transition-all"
            >
              <span
                className="h-14 w-14 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/[0.10]"
                style={{
                  background: `linear-gradient(135deg, ${it.color}22, ${it.color}10)`,
                  color: it.color,
                }}
              >
                {it.icon}
              </span>
              <span className="text-[11px] font-medium text-[#F0F0F5]">{it.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
