'use client';
import { useTranslation } from '@/lib/i18n/context';
import { dateGroupLabel, dayKey } from '@/lib/chat-utils';
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
import { ChatAppBar } from '@/components/chat/ChatAppBar';
import { ChatStream } from '@/components/chat/ChatStream';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
import { AttachmentsSheet } from '@/components/chat/AttachmentsSheet';
import type { ChatMessage as Message, ChatGirlfriend as Girlfriend, IntimacyData } from '@/components/chat/types';
import { CHAT_MOODS as MOODS, CHAT_POSES as POSES, CHAT_ENVS as ENVS } from '@/components/chat/types';
import { loadChatCache, saveChatCache, mergeMessages, deriveMood } from '@/lib/chat-cache';


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

// (helpers moved to @/lib/chat-utils)

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, locale } = useTranslation();
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
    // Instant paint from local cache so history never "vanishes" on re-enter
    const cached = loadChatCache(id);
    if (cached?.messages?.length) {
      setMessages(cached.messages as Message[]);
      if (cached.intimacy) {
        setIntimacy({
          score: cached.intimacy.score,
          level: cached.intimacy.level,
          daily_score_gained: cached.intimacy.daily_score_gained || 0,
        });
      }
    }
    try {
      const [gfRes, msgRes, intRes] = await Promise.all([
        authedFetch(`/api/girlfriends?id=${encodeURIComponent(id)}`),
        authedFetch(`/api/chat/${id}`),
        authedFetch(`/api/intimacy?girlfriend_id=${encodeURIComponent(id)}`),
      ]);

      const gfData = await gfRes.json();
      const msgData = await msgRes.json();
      const intData = await intRes.json();

      let gf =
        (gfData.girlfriends || []).find((g: Girlfriend) => g.id === id) ||
        gfData.girlfriends?.[0] ||
        null;

      // Fallback: list all if id filter unsupported / empty
      if (!gf) {
        const all = await authedFetch('/api/girlfriends').then((r) => r.json()).catch(() => ({}));
        gf = (all.girlfriends || []).find((g: Girlfriend) => g.id === id) || null;
      }
      setGirlfriend(gf);

      const serverMsgs = (msgData.messages || []) as Message[];
      const localMsgs = (cached?.messages || []) as Message[];
      const merged = mergeMessages(serverMsgs, localMsgs) as Message[];
      setMessages(merged);
      if (typeof msgData.hasMore === 'boolean') setHasMore(msgData.hasMore);

      const intScore = (intData.scores || []).find(
        (s: { girlfriend_id: string; score: number; level: number; daily_score_gained?: number }) =>
          s.girlfriend_id === id,
      ) || intData.scores?.[0];
      const nextInt = intScore
        ? {
            score: intScore.score,
            level: intScore.level,
            daily_score_gained: intScore.daily_score_gained || 0,
          }
        : cached?.intimacy
          ? {
              score: cached.intimacy.score,
              level: cached.intimacy.level,
              daily_score_gained: cached.intimacy.daily_score_gained || 0,
            }
          : null;
      if (nextInt) setIntimacy(nextInt);

      const last = merged[merged.length - 1];
      const mood = deriveMood(last?.content, nextInt?.score || 0);
      saveChatCache(id, {
        messages: merged,
        intimacy: nextInt || undefined,
        mood: mood.label,
      });
    } catch (err) {
      logger.error('Failed to load chat:', { data: err });
      // Keep cache if network fails
      if (cached?.messages?.length) {
        setMessages(cached.messages as Message[]);
      }
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

  // Proactive check — only while the tab is visible; 90s cadence (was 60s always-on)
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await authedFetch('/api/proactive/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ girlfriend_id: id }),
        });
        if (!res.ok || cancelled) return;
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
      } catch { /* ignore transient network errors */ }
    };
    const interval = setInterval(tick, 90_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
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
          locale,
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
      let nextIntimacy = intimacy;
      if (intData.score !== undefined) {
        nextIntimacy = {
          score: intData.score,
          level: intData.level,
          daily_score_gained: (intimacy.daily_score_gained || 0) + (intData.gained || 0),
        };
        setIntimacy(nextIntimacy);
      }

      // Persist conversation + intimacy so re-enter always restores history
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const mood = deriveMood(last?.content, nextIntimacy.score);
        saveChatCache(id, {
          messages: prev.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            is_proactive: m.is_proactive,
            media_url: m.media_url,
            status: m.status,
          })),
          intimacy: nextIntimacy,
          mood: mood.label,
        });
        return prev;
      });

      // Soft re-sync from server (real IDs) without clearing UI
      void authedFetch(`/api/chat/${id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.messages?.length) {
            setMessages((prev) => mergeMessages(data.messages, prev) as Message[]);
            saveChatCache(id, { messages: data.messages });
          }
        })
        .catch(() => {});

      void membership.refresh();

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
          <Button variant="outline" className="mt-4" onClick={() => router.push('/chats')}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
      {/* === PLACEHOLDER: AppBar / Messages / Input / Sheets === */}
      <ChatAppBar
        girlfriend={girlfriend}
        levelInfo={levelInfo}
        intimacy={intimacy}
        isTyping={isTyping}
        onBack={() => router.push('/chats')}
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

      {/* Free-tier quota: always-on slim bar; urgent banner at ≥80% */}
      {membership.tier === 'free' && !membership.loading && (
        <div className="mx-3 sm:mx-6 mb-1 space-y-1">
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (membership.todayMessagesCount / 50) * 100)}%`,
                  background:
                    membership.todayMessagesCount >= 40
                      ? 'linear-gradient(90deg, #F59E0B, #EF4444)'
                      : 'linear-gradient(90deg, #FF2D78, #C026D3)',
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-[#8B8BA3] shrink-0">
              {membership.todayMessagesCount}/50
            </span>
          </div>
          {!usageBannerDismissed && membership.todayMessagesCount >= 40 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.10] px-4 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
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
                onClick={() => router.push('/pricing')}
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
        </div>
      )}

      <ChatInputBar
        input={input}
        setInput={setInput}
        onSend={() => sendMessage()}
        onKeyDown={handleKeyDown}
        isSending={isSending}
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

