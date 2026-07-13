'use client';
import { useTranslation } from '@/lib/i18n/context';
import { dateGroupLabel, dayKey } from '@/lib/chat-utils';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  { id: 'rose', name: 'Rose', emoji: '🌹', boost: 3, cost: 1, desc: 'Classic romance' },
  { id: 'lollipop', name: 'Lollipop', emoji: '🍭', boost: 4, cost: 2, desc: 'Playful sweet' },
  { id: 'chocolate', name: 'Chocolate', emoji: '🍫', boost: 5, cost: 3, desc: 'Warm & thoughtful' },
  { id: 'perfume', name: 'Perfume', emoji: '🧴', boost: 8, cost: 6, desc: 'Luxury scent' },
  { id: 'necklace', name: 'Necklace', emoji: '📿', boost: 10, cost: 10, desc: 'Elegant gift' },
  { id: 'teddy', name: 'Teddy', emoji: '🧸', boost: 12, cost: 12, desc: 'Hug-worthy' },
  { id: 'ring', name: 'Promise Ring', emoji: '💍', boost: 15, cost: 18, desc: 'Deep commitment' },
  { id: 'crown', name: 'Crown', emoji: '👑', boost: 25, cost: 30, desc: 'Live-room showstopper' },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', boost: 40, cost: 50, desc: 'Full combo effect' },
  { id: 'castle', name: 'Castle', emoji: '🏰', boost: 60, cost: 80, desc: 'Ultimate live combo' },
] as const;


// (helpers moved to @/lib/chat-utils)

export default function ChatPage() {
  const routeParams = useParams<{ id?: string }>();
  const id = String(routeParams?.id || '').trim();
  const { t, locale } = useTranslation();
  const invalidChatId = !id || id === 'undefined' || id === 'null';
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
  const [aiChannel, setAiChannel] = useState<'sfw' | 'nsfw' | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // UI panels
  const [showGiftDialog, setShowGiftDialog] = useState(false);
  const [giftBurst, setGiftBurst] = useState<{ emoji: string; name: string; combo: number } | null>(null);
  const [, setGiftCombo] = useState(0);
  const giftComboTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      .then(r => readResponseJson(r).catch(() => ({})))
      .then(d => setOutfits(((d as { outfits?: OutfitItem[] }).outfits) || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadData = async () => {
    if (invalidChatId) {
      setIsLoading(false);
      setGirlfriend(null);
      return;
    }
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

      const gfData = await readResponseJson(gfRes).catch(() => ({} as any));
      const msgData = await readResponseJson(msgRes).catch(() => ({} as any));
      const intData = await readResponseJson(intRes).catch(() => ({} as any));

      let gf =
        (gfData.girlfriends || []).find((g: Girlfriend) => g.id === id) ||
        gfData.girlfriends?.[0] ||
        null;

      // Fallback: list all if id filter unsupported / empty
      if (!gf) {
        const all = await authedFetch('/api/girlfriends').then((r) => readResponseJson(r).catch(() => ({}))).catch(() => ({}));
        gf = (((all as { girlfriends?: Girlfriend[] }).girlfriends) || []).find((g: Girlfriend) => g.id === id) || null;
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
      const data = await readResponseJson(res).catch(() => ({} as any));
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
      const data = await readResponseJson(res).catch(() => ({} as any));
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
        const data = await readResponseJson(res).catch(() => ({} as any));
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
    toast.message('Generating selfie…', { description: 'GPU may take 20–90s if cold. Hang tight.' });
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
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) {
        const msg =
          data?.code === 'daily_limit'
            ? (data.error || 'Daily photo limit reached. Upgrade for more.')
            : (data?.error || 'Failed to generate image');
        throw new Error(msg);
      }
      if (data.image_url || data.imageUrl) {
        const newMsg: Message = {
          id: `selfie-${Date.now()}`,
          role: 'assistant',
          content: data.message || "Here's a selfie for you ",
          created_at: new Date().toISOString(),
          media_url: data.image_url || data.imageUrl,
        };
        setMessages(prev => [...prev, newMsg]);
      }
    } catch (err) {
      logger.error('Generate selfie error:', { data: err });
      // surface friendly error in chat as system-ish assistant note
      const text = err instanceof Error ? err.message : 'Failed to generate image';
      setMessages(prev => [
        ...prev,
        {
          id: `selfie-err-${Date.now()}`,
          role: 'assistant',
          content: text,
          created_at: new Date().toISOString(),
        },
      ]);
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

      if (!res.ok) {
        const errBody = await readResponseJson(res).catch(() => ({} as any));
        throw new Error(errBody?.error || `Failed to send message (${res.status})`);
      }
      const ch = res.headers.get('X-AI-Channel');
      const md = res.headers.get('X-AI-Model');
      if (ch === 'sfw' || ch === 'nsfw') setAiChannel(ch);
      if (md) setAiModel(md);

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
      const intData = await readResponseJson(intRes).catch(() => ({} as any));
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
        .then((r) => readResponseJson(r).catch(() => ({})))
        .then((data) => {
          const msgs = (data as { messages?: Message[] }).messages;
          if (msgs?.length) {
            setMessages((prev) => mergeMessages(msgs, prev) as Message[]);
            saveChatCache(id, { messages: msgs });
          }
        })
        .catch(() => {});

      void membership.refresh();

      // Check achievements (fire and forget)
      authedFetch('/api/v2/user/achievements').then(r => readResponseJson(r).catch(() => ({}))).then((data: any) => {
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
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: msg.includes('limit')
            ? msg
            : `I missed that for a second... ${msg}. Try sending again?`,
          created_at: new Date().toISOString(),
        },
      ]);
      setIsTyping(false);
    }
    setIsSending(false);
  };

  const handleSendGift = (gift: typeof GIFTS[number]) => {
    setShowAttachments(false);
    setGiftCombo((c) => {
      const next = c + 1;
      setGiftBurst({ emoji: gift.emoji, name: gift.name, combo: next });
      if (giftComboTimer.current) clearTimeout(giftComboTimer.current);
      giftComboTimer.current = setTimeout(() => {
        setGiftBurst(null);
        setGiftCombo(0);
      }, 2400);
      toast.success(`${gift.emoji} x${next} ${gift.name}`, {
        description: `+${gift.boost * next} intimacy combo`,
      });
      return next;
    });
    // Keep gallery open for rapid live-room combo taps
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
    const fallback = INTIMACY_LEVELS[0] || { level: 1, title: 'Stranger', min_score: 0, color: '#ff2e88' };
    let level: typeof INTIMACY_LEVELS[number] = fallback as typeof INTIMACY_LEVELS[number];
    for (const l of INTIMACY_LEVELS) {
      if (score >= l.min_score) level = l;
    }
    return level || fallback;
  };

  function computeProgress(score: number, level: number): number {
    const safeScore = Number(score) || 0;
    const safeLevel = Math.max(1, Math.min(Number(level) || 1, INTIMACY_LEVELS.length));
    if (safeLevel >= INTIMACY_LEVELS.length) return 100;
    const curMin = Number(INTIMACY_LEVELS[safeLevel - 1]?.min_score) || 0;
    const nextMin = Number(INTIMACY_LEVELS[safeLevel]?.min_score) || curMin + 100;
    const span = Math.max(1, nextMin - curMin);
    return Math.min(100, Math.max(0, Math.round(((safeScore - curMin) / span) * 100)));
  }

  const levelInfo = getLevelInfo(Number(intimacy?.score) || 0) || INTIMACY_LEVELS[0] || { level: 1, min_score: 0, title: 'Stranger', color: '#6b7280' };

  // Group messages by day + consecutive-merge (for IM look)
  const renderRows = useMemo(() => {
    type Row =
      | { type: 'date'; key: string; label: string }
      | { type: 'msg'; key: string; msg: Message; showAvatar: boolean; merged: boolean };
    const out: Row[] = [];
    let lastDay = '';
    let lastRole: 'user' | 'assistant' | null = null;
    let lastTime = 0;
    (Array.isArray(messages) ? messages : []).forEach((m, i) => {
      try {
        if (!m || !m.id) return;
        const created = m.created_at || new Date().toISOString();
        const dk = dayKey(created);
        if (dk !== lastDay) {
          out.push({ type: 'date', key: `date-${dk}-${i}`, label: dateGroupLabel(created) });
          lastDay = dk;
          lastRole = null;
          lastTime = 0;
        }
        const ts = new Date(created).getTime() || 0;
        const role = m.role === 'user' ? 'user' : 'assistant';
        const merged = lastRole === role && Math.abs(ts - lastTime) < 3 * 60 * 1000;
        const showAvatar = role === 'assistant' && !merged;
        out.push({ type: 'msg', key: String(m.id), msg: { ...m, role, created_at: created }, showAvatar, merged });
        lastRole = role;
        lastTime = ts;
      } catch {
        /* skip bad message row */
      }
    });
    return out;
  }, [messages]);

  if (invalidChatId) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center bg-[#08040e] px-6">
        <div className="text-center">
          <p className="text-white/40">This chat link is invalid or expired.</p>
          <Button variant="outline" className="mt-4 border-white/15 text-white" onClick={() => router.push('/chats')}>
            Go back
          </Button>
        </div>
      </div>
    );
  }


  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#08040e]">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]" />
      </div>
    );
  }

  if (!girlfriend) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#08040e] px-6">
        <div className="text-center">
          <p className="text-white/40">{t('chat.companionNotFound') || 'Companion not found'}</p>
          <Button variant="outline" className="mt-4 border-white/15 text-white" onClick={() => router.push('/chats')}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const usageText = String(t('chat.usageWarning') || '')
    .replace(/\{count\}/g, String(membership.todayMessagesCount ?? 0))
    .replace(/\{limit\}/g, String(membership.capabilities?.dailyMessageLimit === Number.POSITIVE_INFINITY ? '∞' : (membership.capabilities?.dailyMessageLimit || 40)));

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#08040e] text-white">
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

      {/* Compact intimacy strip — full IntimacyProgress was crowding the dialog */}
      <div className="shrink-0 px-3 sm:px-4 py-1.5 border-b border-white/[0.05] bg-[#0a0612]/60">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <Heart className="h-3.5 w-3.5 text-[#FF6BA6] shrink-0" />
          <span className="text-[11px] text-white/70 shrink-0">
            Lv.{levelInfo.level} · {levelInfo.title}
          </span>
          <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] transition-all duration-500"
              style={{ width: `${computeProgress(intimacy.score, levelInfo.level)}%` }}
            />
          </div>
          <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0">
            {Math.round(intimacy.score)}pts · keep chatting to raise heat
          </span>
        </div>
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
      
      {aiChannel && (
        <div className="px-3 py-1 text-[11px] text-[#94A3B8] flex items-center gap-2 border-b border-white/5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
            aiChannel === 'nsfw' ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'
          }`}>
            {aiChannel === 'nsfw' ? 'Intimate heat' : 'Soft heat'}
          </span>
          {aiModel && <span className="truncate opacity-70">{aiModel}</span>}
        </div>
      )}

      {membership.tier === 'free' && !membership.loading && (
        <div className="mx-3 sm:mx-6 mb-1 space-y-1">
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((Number(membership.todayMessagesCount) || 0) / 40) * 100)}%`,
                  background:
                    (Number(membership.todayMessagesCount) || 0) >= 24
                      ? 'linear-gradient(90deg, #F59E0B, #EF4444)'
                      : 'linear-gradient(90deg, #FF2D78, #C026D3)',
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-[#8B8BA3] shrink-0">
              {Number(membership.todayMessagesCount) || 0}/40
            </span>
          </div>
          {!usageBannerDismissed && (Number(membership.todayMessagesCount) || 0) >= 24 && (
            <div className="flex items-center gap-3 rounded-2xl glass px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/90 leading-snug">{usageText}</p>
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
            </div>
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
              Memories with {girlfriend?.name || "her"}
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

      {giftBurst && (
        <div className="pointer-events-none fixed inset-0 z-[120] flex items-end justify-center pb-36 sm:items-center sm:pb-0">
          <div className="animate-bounce text-center">
            <div className="text-7xl drop-shadow-[0_0_30px_rgba(255,45,120,0.7)]">{giftBurst.emoji}</div>
            <div className="mt-3 text-sm font-bold tracking-wide text-white bg-gradient-to-r from-[#ff2e88] to-[#c026d3] px-4 py-1.5 rounded-full shadow-lg">
              {giftBurst.name}{giftBurst.combo > 1 ? `  x${giftBurst.combo}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Gift Dialog */}
      <Dialog open={showGiftDialog} onOpenChange={setShowGiftDialog}>
        <DialogContent className="glass-modal sm:max-w-md border-white/12 text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-white">Live Gifts</DialogTitle>
            <DialogDescription className="text-white/50">
              Pick a gift for {girlfriend?.name || "her"}. Live-room combo + intimacy boost.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2.5 py-2 max-h-[50vh] overflow-y-auto">
            {GIFTS.map((gift) => (
              <button
                key={gift.id}
                type="button"
                onClick={() => handleSendGift(gift)}
                className="relative flex flex-col items-center gap-1 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#FF2D78]/40 transition-all text-center active:scale-[0.97] touch-manipulation"
              >
                <span className="text-3xl leading-none">{gift.emoji}</span>
                <div className="text-[11px] font-semibold text-white truncate w-full">{gift.name}</div>
                <div className="text-[10px] text-[#FF6BA6] font-bold">+{gift.boost}</div>
                <div className="text-[9px] text-white/35">{gift.cost} coins</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Wardrobe Dialog */}
      <Dialog open={showWardrobeDialog} onOpenChange={setShowWardrobeDialog}>
        <DialogContent className="glass-modal sm:max-w-lg border-white/12 text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-white">{t('chat.wardrobe') || 'Wardrobe'}</DialogTitle>
            <DialogDescription className="text-white/40">
              Dress up {girlfriend?.name || "her"} with a new outfit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
            {outfits.map((outfit) => (
              <button
                key={outfit.id}
                onClick={() => handleEquipOutfit(outfit.id)}
                className={`relative flex flex-col items-center gap-1.5 p-4 rounded-2xl border transition-all active:scale-[0.97] ${
                  selectedOutfit === outfit.id
                    ? 'border-[#FF2D78]/40 bg-[#FF2D78]/10 ring-1 ring-[#FF2D78]/20 shadow-[0_0_18px_rgba(255,45,120,0.18)]'
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

      {/* Image Lightbox — no nested <button> (invalid HTML → React hydration issues) */}
      {showLightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-black/92 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(null)}
          onKeyDown={(e) => e.key === 'Escape' && setShowLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white z-10"
            aria-label="Close"
            onClick={() => setShowLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={showLightbox}
            alt="Preview"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

