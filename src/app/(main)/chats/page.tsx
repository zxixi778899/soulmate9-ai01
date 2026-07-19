'use client';

/**
 * Unified WeChat/WhatsApp-style chats page.
 * Desktop: sidebar (friend list) + chat panel side-by-side.
 * Mobile: friend list → tap → chat view → back button returns to list.
 */

import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useDataSync, notifyDataChange } from '@/hooks/useDataSync';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useMembership } from '@/hooks/useMembership';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Loader2, MessageCircle, Plus, Search, X, Trash2,
  Heart, BrainCircuit, ChevronDown, Camera, Crown, Globe, Send,
  Image as ImageIcon, Shirt,
} from 'lucide-react';
import { INTIMACY_LEVELS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Chat components
import { ChatAppBar } from '@/components/chat/ChatAppBar';
import { ChatStream } from '@/components/chat/ChatStream';
import { ChatInputBar, type PendingMedia } from '@/components/chat/ChatInputBar';
import { GiftEffectOverlay, type GiftBurstState } from '@/components/chat/GiftEffectOverlay';
import type { ChatMessage, ChatGirlfriend, IntimacyData, StreamRow } from '@/components/chat/types';

// Utils
import { dateGroupLabel, dayKey } from '@/lib/chat-utils';
import { loadChatCache, saveChatCache, mergeMessages, deriveMood } from '@/lib/chat-cache';
import { parseChatImageIntent } from '@/lib/chat-image-intent';
import { sanitizeAssistantReply } from '@/lib/chat-reply-sanitize';
import { DEFAULT_CHAT_GIFTS, type ChatGift } from '@/lib/gifts/catalog';

// ─── Types ───────────────────────────────────────────────────────────────────

type Friend = {
  id: string;
  name: string;
  avatar_url: string | null;
  personality: string | null;
  review_status?: string | null;
  is_public?: boolean;
};
type LastMessage = {
  girlfriend_id: string;
  content: string;
  created_at: string;
  role?: 'user' | 'assistant';
};
type IntimacyRow = { girlfriend_id: string; score: number; level: number };

type OutfitItem = { id: string; name: string; emoji: string; category: string; tier: string; description: string; intimacy_boost: number };
type MemoryItem = { id: string; content: string; type: string; category: string; created_at: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const ts = date.getTime();
  if (ts >= startOfToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (ts >= startOfYesterday) return '昨天';
  if (diff < 7 * 86_400_000) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

function getLevelInfo(score: number) {
  const levels = INTIMACY_LEVELS as unknown as Array<{ level: number; min_score: number; title: string; color: string }>;
  let lvl = levels[0];
  for (const l of levels) { if (score >= l.min_score) lvl = l; }
  return lvl;
}

function computeProgress(score: number, level: number): number {
  const safeScore = Number(score) || 0;
  const safeLevel = Math.max(1, Math.min(Number(level) || 1, INTIMACY_LEVELS.length));
  if (safeLevel >= INTIMACY_LEVELS.length) return 100;
  const curMin = Number(INTIMACY_LEVELS[safeLevel - 1]?.min_score) || 0;
  const nextMin = Number(INTIMACY_LEVELS[safeLevel]?.min_score) || curMin + 100;
  return Math.min(100, Math.max(0, Math.round(((safeScore - curMin) / (nextMin - curMin)) * 100)));
}

// ─── Friend Row ──────────────────────────────────────────────────────────────

function FriendRow({ friend, lastMsg, score, selected, deleting, submitting, tick, onDelete, onSubmit, onAlbum, onWardrobe, onClick }: {
  friend: Friend;
  lastMsg?: LastMessage;
  score: number;
  selected: boolean;
  deleting: boolean;
  submitting: boolean;
  tick: number;
  onDelete: (gf: Friend, e: MouseEvent) => void;
  onSubmit: (gf: Friend, e: MouseEvent) => void;
  onAlbum: (gf: Friend, e: MouseEvent) => void;
  onWardrobe: (gf: Friend, e: MouseEvent) => void;
  onClick: () => void;
}) {
  const mood = deriveMood(lastMsg?.content || (tick % 2 === 0 ? friend.personality || '' : ''), score);
  const preview = lastMsg?.content
    ? lastMsg.role === 'user' ? `你: ${lastMsg.content}` : lastMsg.content
    : '还没有消息 · 点进来聊聊';
  const reviewStatus = friend.review_status || 'draft';
  const isPublished = friend.is_public && reviewStatus === 'approved';
  const isPending = reviewStatus === 'pending';
  const isDraft = reviewStatus === 'draft' || reviewStatus === 'rejected';

  return (
    <li className="relative group">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 px-3 sm:px-4 py-3.5 pr-20 text-left active:bg-white/[0.06] touch-manipulation min-h-[72px] transition-colors',
          selected && 'bg-white/[0.06]',
        )}
      >
        <div className="relative shrink-0">
          <Avatar className="h-14 w-14 ring-1 ring-[#ff2e88]/25">
            {friend.avatar_url
              ? <AvatarImage src={friend.avatar_url} alt={friend.name} className="object-cover" />
              : <AvatarFallback className="bg-gradient-to-br from-[#ff2e88]/40 to-[#c026d3]/30 text-[#ff6ba6] font-bold">{friend.name?.charAt(0) || '?'}</AvatarFallback>}
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 text-sm drop-shadow" title={mood.label}>{mood.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-semibold text-white truncate">{friend.name}</span>
            {lastMsg && <span className="text-[11px] tabular-nums text-white/35 shrink-0">{formatRelative(lastMsg.created_at)}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[11px] font-medium shrink-0', mood.tone)}>{mood.emoji} {mood.label}</span>
            {isPublished && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Public</span>}
            {isPending && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">Reviewing</span>}
            <span className="text-[12px] text-white/35 truncate">· {preview}</span>
          </div>
        </div>
      </button>
      {/* Action buttons */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Album"
          onClick={(e) => onAlbum(friend, e)}
          className="h-8 w-8 rounded-full glass flex items-center justify-center text-white/40 hover:text-sky-400 hover:bg-sky-500/10 touch-manipulation"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Wardrobe"
          onClick={(e) => onWardrobe(friend, e)}
          className="h-8 w-8 rounded-full glass flex items-center justify-center text-white/40 hover:text-violet-400 hover:bg-violet-500/10 touch-manipulation"
        >
          <Shirt className="h-3.5 w-3.5" />
        </button>
        {isDraft && (
          <button
            type="button"
            aria-label="Submit for review"
            disabled={submitting}
            onClick={(e) => onSubmit(friend, e)}
            className="h-8 w-8 rounded-full glass flex items-center justify-center text-white/40 hover:text-emerald-400 hover:bg-emerald-500/10 touch-manipulation disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          type="button"
          aria-label="Delete friend"
          disabled={deleting}
          onClick={(e) => onDelete(friend, e)}
          className="h-8 w-8 rounded-full glass flex items-center justify-center text-white/40 hover:text-rose-400 hover:bg-rose-500/10 touch-manipulation disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </li>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ChatsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const membership = useMembership();

  // ── Friend list state ──
  const [friends, setFriends] = useState<Friend[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [intimacyMap, setIntimacyMap] = useState<Record<string, number>>({});
  const [listLoading, setListLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Chat state ──
  const [girlfriend, setGirlfriend] = useState<ChatGirlfriend | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [intimacy, setIntimacy] = useState<IntimacyData>({ score: 0, level: 1, daily_score_gained: 0 });
  const [outfits, setOutfits] = useState<OutfitItem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [gifts, setGifts] = useState<ChatGift[]>(DEFAULT_CHAT_GIFTS);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showAlbum, setShowAlbum] = useState(false);
  const [showLightbox, setShowLightbox] = useState<string | null>(null);
  const [selectedOutfit, setSelectedOutfit] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedPose, setSelectedPose] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [smartSuggestions, setSmartSuggestions] = useState<string[]>([]);
  const [smartSuggestionsLoading, setSmartSuggestionsLoading] = useState(false);
  const [giftBurst, setGiftBurst] = useState<GiftBurstState | null>(null);
  const [usageBannerDismissed, setUsageBannerDismissed] = useState(false);

  const giftComboRef = useRef(0);
  const giftComboTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // ── Mood re-roll ──
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 20000); return () => clearInterval(t); }, []);

  // ── Load friend list ──
  const loadList = useCallback(async () => {
    const [gfData, msgData, intData] = await Promise.all([
      authedFetch('/api/girlfriends').then((r) => r.json()),
      authedFetch('/api/chat/last-messages').then((r) => r.json()),
      authedFetch('/api/intimacy').then((r) => r.json()).catch(() => ({ scores: [] })),
    ]);
    setFriends(gfData.girlfriends || []);
    const msgMap: Record<string, LastMessage> = {};
    (msgData.messages || []).forEach((m: LastMessage) => { msgMap[m.girlfriend_id] = m; });
    (gfData.girlfriends || []).forEach((g: Friend) => {
      const cache = loadChatCache(g.id);
      const last = cache?.messages?.[cache.messages.length - 1];
      if (last) {
        const existing = msgMap[g.id];
        if (!existing || new Date(last.created_at) > new Date(existing.created_at)) {
          msgMap[g.id] = { girlfriend_id: g.id, content: last.content, created_at: last.created_at, role: last.role };
        }
      }
    });
    setLastMessages(msgMap);
    const iMap: Record<string, number> = {};
    (intData.scores || []).forEach((s: IntimacyRow) => { iMap[s.girlfriend_id] = s.score; });
    setIntimacyMap(iMap);
    setListLoading(false);
  }, []);

  useAutoRefresh(loadList);
  useDataSync(loadList, ['girlfriends', 'chat']);

  useEffect(() => {
    loadList().catch(() => setListLoading(false));
    void authedFetch('/api/proactive/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((data: { messages?: Array<{ girlfriend_id: string; content: string }> }) => {
        const list = data.messages || [];
        if (!list.length) return;
        setLastMessages((prev) => {
          const next = { ...prev };
          for (const m of list) next[m.girlfriend_id] = { girlfriend_id: m.girlfriend_id, content: m.content, created_at: new Date().toISOString(), role: 'assistant' };
          return next;
        });
      })
      .catch(() => {});
  }, [loadList]);

  // Gifts (admin-managed)
  useEffect(() => {
    fetch('/api/gifts', { cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((d: { gifts?: ChatGift[] }) => { if (Array.isArray(d.gifts) && d.gifts.length > 0) setGifts(d.gifts); })
      .catch(() => {});
  }, []);

  // Outfits (one-time)
  useEffect(() => {
    authedFetch('/api/outfits')
      .then((r) => readResponseJson(r).catch(() => ({})))
      .then((d) => setOutfits(((d as { outfits?: OutfitItem[] }).outfits) || []))
      .catch(() => {});
  }, []);

  // ── Sorted & filtered friends ──
  const sorted = useMemo(() => {
    return [...friends]
      .sort((a, b) => (lastMessages[b.id]?.created_at || '').localeCompare(lastMessages[a.id]?.created_at || ''))
      .filter((gf) => !query || gf.name.toLowerCase().includes(query.toLowerCase()));
  }, [friends, lastMessages, query]);

  // ── Delete friend ──
  const deleteFriend = async (gf: Friend, e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const zh = locale === 'zh';
    const confirmMsg = zh
      ? `确定要移除「${gf.name}」吗？好友关系将解除，亲密值归零。此操作不可撤销。`
      : `Remove "${gf.name}" from friends? The friendship will be removed and intimacy will reset to 0. This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    setDeletingId(gf.id);
    try {
      const res = await authedFetch(`/api/girlfriends?id=${encodeURIComponent(gf.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error || (zh ? '删除失败' : 'Delete failed');
        toast.error(errMsg);
        return;
      }
      setFriends((prev) => prev.filter((g) => g.id !== gf.id));
      setLastMessages((prev) => { const n = { ...prev }; delete n[gf.id]; return n; });
      setIntimacyMap((prev) => { const n = { ...prev }; delete n[gf.id]; return n; });
      if (selectedId === gf.id) { setSelectedId(null); setGirlfriend(null); setMessages([]); }
      toast.success(zh ? '已移除好友' : 'Friend removed');
      notifyDataChange('girlfriends');
      notifyDataChange('chat');
    } catch { toast.error(zh ? '网络错误' : 'Network error'); }
    finally { setDeletingId(null); }
  };

  // ── Album & Wardrobe shortcuts ──
  const handleAlbumClick = (gf: Friend, e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedId(gf.id);
    setShowAlbum(true);
  };
  const handleWardrobeClick = (gf: Friend, e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    router.push('/wardrobe');
  };

  // ── Submit friend for public review ──
  const submitForReview = async (gf: Friend, e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const zh = locale === 'zh';
    if (!window.confirm(zh ? `将「${gf.name}」提交公开审核？` : `Submit "${gf.name}" for public review?`)) return;
    setSubmittingId(gf.id);
    try {
      const res = await authedFetch('/api/girlfriends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gf.id, review_status: 'pending', submitted_at: new Date().toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error((data as { error?: string }).error || 'Submit failed'); return; }
      setFriends((prev) => prev.map((g) => g.id === gf.id ? { ...g, review_status: 'pending', submitted_at: new Date().toISOString() } : g));
      toast.success(zh ? '已提交审核' : 'Submitted for review');
      notifyDataChange('girlfriends');
    } catch { toast.error('Network error'); }
    finally { setSubmittingId(null); }
  };

  // ── Load chat for selected friend ──
  const loadChat = useCallback(async (id: string) => {
    setIsLoading(true);
    const cached = loadChatCache(id);
    if (cached?.messages?.length) {
      try { setMessages(mergeMessages([], cached.messages) as ChatMessage[]); } catch { setMessages([]); }
      if (cached.intimacy) setIntimacy({ score: Number(cached.intimacy.score) || 0, level: Number(cached.intimacy.level) || 1, daily_score_gained: Number(cached.intimacy.daily_score_gained) || 0 });
    }
    try {
      const [gfRes, msgRes, intRes] = await Promise.all([
        authedFetch(`/api/girlfriends?id=${encodeURIComponent(id)}`),
        authedFetch(`/api/chat/${id}`),
        authedFetch(`/api/intimacy?girlfriend_id=${encodeURIComponent(id)}`),
      ]);
      const gfData = await readResponseJson(gfRes).catch(() => ({}));
      const msgData = await readResponseJson(msgRes).catch(() => ({}));
      const intData = await readResponseJson(intRes).catch(() => ({}));

      let gfList = Array.isArray((gfData as { girlfriends?: ChatGirlfriend[] }).girlfriends) ? (gfData as { girlfriends: ChatGirlfriend[] }).girlfriends : [];
      let gf: ChatGirlfriend | null = gfList.find((g) => g.id === id) || gfList[0] || null;
      if (!gf) {
        const all = await authedFetch('/api/girlfriends').then((r) => readResponseJson(r).catch(() => ({}))).catch(() => ({}));
        const listed = ((all as { girlfriends?: ChatGirlfriend[] }).girlfriends) || [];
        gf = listed.find((g) => g.id === id) || null;
      }
      if (gf) setGirlfriend({ ...gf, avatar_url: gf.avatar_url || gf.portrait_url || gf.image_url || null, portrait_url: gf.portrait_url || gf.avatar_url || gf.image_url || null });

      const serverMsgs = Array.isArray((msgData as { messages?: ChatMessage[] }).messages) ? (msgData as { messages: ChatMessage[] }).messages : [];
      const localMsgs = (cached?.messages || []) as ChatMessage[];
      let merged: ChatMessage[];
      try { merged = mergeMessages(serverMsgs, localMsgs) as ChatMessage[]; } catch { merged = serverMsgs.length ? serverMsgs : localMsgs; }
      setMessages(merged);
      if (typeof (msgData as { hasMore?: boolean }).hasMore === 'boolean') setHasMore(Boolean((msgData as { hasMore: boolean }).hasMore));

      const scores = Array.isArray((intData as { scores?: Array<{ girlfriend_id: string; score: number; level: number; daily_score_gained?: number }> }).scores)
        ? (intData as { scores: Array<{ girlfriend_id: string; score: number; level: number; daily_score_gained?: number }> }).scores : [];
      const intRow = scores.find((s) => s.girlfriend_id === id) || scores[0];
      if (intRow) setIntimacy({ score: Number(intRow.score) || 0, level: Number(intRow.level) || 1, daily_score_gained: Number(intRow.daily_score_gained) || 0 });
    } catch (err) {
      logger.error('Failed to load chat:', { data: err });
    }
    setIsLoading(false);
  }, []);

  // When selectedId changes, load that chat
  useEffect(() => {
    if (selectedId) {
      setPage(1); setHasMore(true); setMessages([]); setGirlfriend(null);
      setSmartSuggestions([]); setPendingMedia(null); setSelectedOutfit(null);
      void loadChat(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Pagination ──
  const loadHistory = async () => {
    if (loadingMore || !hasMore || !selectedId) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await authedFetch(`/api/chat/${selectedId}?page=${nextPage}&limit=30`);
      const data = await readResponseJson(res).catch(() => ({}));
      if ((data as { messages?: ChatMessage[] }).messages?.length) {
        setMessages((prev) => [...(data as { messages: ChatMessage[] }).messages, ...prev]);
        setPage(nextPage);
      }
      if (!(data as { messages?: ChatMessage[] }).messages?.length || (data as { messages: ChatMessage[] }).messages.length < 30) setHasMore(false);
    } catch { /* ignore */ }
    setLoadingMore(false);
  };

  // ── Memories ──
  const loadMemories = async () => {
    if (!selectedId) return;
    setLoadingMemories(true);
    try {
      const res = await authedFetch(`/api/memories?girlfriend_id=${selectedId}`);
      const data = await readResponseJson(res).catch(() => ({}));
      setMemories((data as { memories?: MemoryItem[] }).memories || []);
    } catch { /* ignore */ }
    setLoadingMemories(false);
  };
  useEffect(() => { if (showMemories) loadMemories(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showMemories]);

  // ── Smart suggestions ──
  const fetchSmartSuggestions = useCallback(async (lastAssistant: string, lastUser?: string) => {
    if (!selectedId || !lastAssistant?.trim()) return;
    setSmartSuggestionsLoading(true);
    try {
      const res = await authedFetch('/api/chat/quick-replies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ girlfriend_id: selectedId, last_assistant: lastAssistant.slice(0, 600), last_user: (lastUser || '').slice(0, 400), locale }),
      });
      const data = (await readResponseJson(res).catch(() => ({}))) as { replies?: string[] };
      if (Array.isArray(data.replies) && data.replies.length) setSmartSuggestions(data.replies.slice(0, 3));
    } catch { /* keep previous */ }
    finally { setSmartSuggestionsLoading(false); }
  }, [selectedId, locale]);

  // Seed suggestions after chat loads
  useEffect(() => {
    if (isLoading || !messages.length) return;
    const lastA = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
    const lastU = [...messages].reverse().find((m) => m.role === 'user' && m.content);
    if (lastA?.content) void fetchSmartSuggestions(lastA.content, lastU?.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // ── Scroll ──
  useEffect(() => { if (autoScroll && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, isTyping, autoScroll]);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(dist > 240); setAutoScroll(dist < 80);
  }, []);
  const scrollToBottom = () => { if (bottomRef.current) { bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); setAutoScroll(true); } };

  // ── Upload ──
  const uploadUserFile = async (file: File, folder: string): Promise<string> => {
    const fd = new FormData(); fd.append('file', file); fd.append('folder', folder);
    const res = await authedFetch('/api/upload', { method: 'POST', body: fd });
    const data = await readResponseJson<{ url?: string; error?: string }>(res);
    if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
    return data.url;
  };

  const handlePickImage = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    if (!/^image\//.test(file.type)) { toast.error('Please choose an image file'); return; }
    const previewUrl = URL.createObjectURL(file);
    setPendingMedia({ kind: 'image', url: previewUrl, previewUrl, file });
  };
  const clearPendingMedia = () => {
    if (pendingMedia?.previewUrl?.startsWith('blob:')) { try { URL.revokeObjectURL(pendingMedia.previewUrl); } catch { /* ignore */ } }
    setPendingMedia(null);
  };

  // ── Voice ──
  const stopVoiceTimer = () => { if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; } };
  const toggleVoiceRecord = async () => {
    if (isRecording && mediaRecorderRef.current) { mediaRecorderRef.current.stop(); setIsRecording(false); stopVoiceTimer(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) mediaChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 800) { toast.error('Recording too short'); return; }
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        const pvUrl = URL.createObjectURL(blob);
        setPendingMedia({ kind: 'audio', url: pvUrl, previewUrl: pvUrl, file });
      };
      mediaRecorderRef.current = recorder; recorder.start(200); setIsRecording(true); setVoiceSeconds(0);
      voiceTimerRef.current = setInterval(() => { setVoiceSeconds((s) => { if (s >= 59) { recorder.stop(); setIsRecording(false); stopVoiceTimer(); return s; } return s + 1; }); }, 1000);
    } catch (err) { logger.warn('mic denied', { err: err instanceof Error ? err.message : String(err) }); toast.error('Microphone permission needed'); }
  };

  // ── Selfie generation ──
  const generateSelfie = async (userRequest?: string) => {
    if (isGenerating || !selectedId) return;
    setIsGenerating(true);
    const req = (userRequest || 'send me a sexy selfie').trim();
    const waitZh = /[\u4e00-\u9fff]/.test(req) || String(locale || '').toLowerCase().startsWith('zh');
    const waitText = waitZh ? '哥哥我正在拍照哦，要换衣服、化妆需要点时间，请哥哥耐心等待，拍好了我会发给哥哥哦！' : "Babe I'm taking a photo for you~ need a moment to change and do my makeup. Be patient for me 💕";
    const waitId = `selfie-wait-${Date.now()}`;
    setMessages((prev) => [...prev, { id: waitId, role: 'assistant', content: waitText, created_at: new Date().toISOString() }]);
    setIsTyping(true); setAutoScroll(true);
    toast.message(waitZh ? '她正在拍照…' : 'She is taking a photo…');
    try {
      const chatCtx = messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-8).map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 400) }));
      const res = await authedFetch('/api/chat/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ girlfriend_id: selectedId, user_request: req, message: req, chat_context: chatCtx, mood: selectedMood, pose: selectedPose, environment: selectedEnvironment, locale }),
      });
      const data = await readResponseJson<{ error?: string; localized_error?: string; code?: string; image_url?: string; imageUrl?: string; message?: string }>(res);
      if (!res.ok) throw new Error(data?.code === 'daily_limit' ? (data.localized_error || t('chat.imageDailyLimit')) : (data?.localized_error || data?.error || t('chat.imageFailed')));
      setIsTyping(false);
      if (data.image_url || data.imageUrl) {
        const readyText = waitZh ? (data.message || '拍好啦～给哥哥看 💕') : (data.message || "Here's a photo just for you 💕");
        setMessages((prev) => [...prev, { id: `selfie-${Date.now()}`, role: 'assistant', content: readyText, created_at: new Date().toISOString(), media_url: data.image_url || data.imageUrl, media_type: 'image' }]);
      }
    } catch (err) {
      setIsTyping(false); logger.error('Generate selfie error:', { data: err });
      setMessages((prev) => prev.filter((m) => m.id !== waitId));
      setMessages((prev) => [...prev, { id: `selfie-err-${Date.now()}`, role: 'assistant', content: err instanceof Error ? err.message : 'Photo failed', created_at: new Date().toISOString() }]);
    }
    setIsGenerating(false);
  };

  // ── Send message (SSE streaming) ──
  const sendMessage = async (overrideText?: string, opts?: { silent?: boolean }) => {
    if (!selectedId) return;
    const text = (overrideText ?? input).trim();
    const media = opts?.silent ? null : pendingMedia;
    if ((!text && !media) || (isSending && !opts?.silent)) return;
    if (!opts?.silent) { setInput(''); setSmartSuggestions([]); clearPendingMedia(); setIsSending(true); }
    const mediaSnapshot = opts?.silent ? null : media;
    setAutoScroll(true);

    let mediaUrl: string | undefined; let mediaType: string | undefined;
    try {
      if (mediaSnapshot?.file) {
        mediaUrl = await uploadUserFile(mediaSnapshot.file, mediaSnapshot.kind === 'audio' ? `chat_voice/${selectedId}` : `chat_user/${selectedId}`);
        mediaType = mediaSnapshot.kind;
      } else if (mediaSnapshot?.url?.startsWith('http')) { mediaUrl = mediaSnapshot.url; mediaType = mediaSnapshot.kind; }
    } catch (upErr) { setIsSending(false); toast.error(upErr instanceof Error ? upErr.message : 'Upload failed'); if (mediaSnapshot) setPendingMedia(mediaSnapshot); return; }

    const displayText = text || (mediaType === 'audio' ? '[Voice message]' : mediaType === 'image' ? '[Photo]' : '');
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content: displayText, created_at: new Date().toISOString(), status: 'sending', media_url: mediaUrl || mediaSnapshot?.previewUrl || null, media_type: mediaType || null }]);

    const wantsPhoto = parseChatImageIntent(text).wantsImage;

    try {
      const res = await authedFetch('/api/chat/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text || displayText, girlfriend_id: selectedId, mood: selectedMood, pose: selectedPose, environment: selectedEnvironment, locale, ...(mediaUrl ? { media_url: mediaUrl, media_type: mediaType } : {}) }),
      });
      if (!res.ok) {
        const errBody = (await readResponseJson(res).catch(() => ({}))) as { error?: string; localized_error?: string; code?: string };
        throw new Error(typeof errBody?.localized_error === 'string' ? errBody.localized_error : errBody.code === 'daily_message_limit' ? t('chat.messageDailyLimit') : typeof errBody?.error === 'string' ? errBody.error : `Send failed (${res.status})`);
      }

      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'sent', media_url: mediaUrl || m.media_url, media_type: mediaType || m.media_type } : m));

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder(); let fullContent = ''; let sseBuf = '';
      setIsTyping(true);
      const assistId = `assist-${Date.now()}`; let assistInserted = false;
      const pushAssist = (content: string) => {
        if (!content) return;
        if (!assistInserted) { assistInserted = true; setIsTyping(false); setMessages((prev) => [...prev, { id: assistId, role: 'assistant', content, created_at: new Date().toISOString() }]); }
        else setMessages((prev) => prev.map((m) => m.id === assistId ? { ...m, content } : m));
      };
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const parts = sseBuf.split('\n'); sseBuf = parts.pop() || '';
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6)) as { error?: string; content?: string; replace?: string };
            if (json.error) continue;
            if (typeof json.replace === 'string' && json.replace.length) { fullContent = sanitizeAssistantReply(json.replace, { preferZh: /[\u4e00-\u9fff]/.test(json.replace) }); pushAssist(fullContent); continue; }
            if (json.content) { fullContent += json.content; pushAssist(fullContent); }
          } catch { /* skip */ }
        }
      }
      if (fullContent) {
        const cleaned = sanitizeAssistantReply(fullContent, { preferZh: /[\u4e00-\u9fff]/.test(fullContent) || String(locale || '').toLowerCase().startsWith('zh') });
        if (cleaned !== fullContent) { fullContent = cleaned; pushAssist(fullContent); }
      }
      setIsTyping(false);
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'read' } : m));
      if (fullContent) void fetchSmartSuggestions(fullContent, text);
      if (wantsPhoto && text) void generateSelfie(text);

      // Intimacy update
      const intRes = await authedFetch('/api/intimacy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ girlfriend_id: selectedId, message_type: 'normal' }) });
      const intData = (await readResponseJson(intRes).catch(() => ({}))) as { score?: number; level?: number; gained?: number };
      let nextIntimacy = intimacy;
      if (typeof intData.score === 'number') {
        nextIntimacy = { score: intData.score, level: typeof intData.level === 'number' ? intData.level : 1, daily_score_gained: (intimacy.daily_score_gained || 0) + (typeof intData.gained === 'number' ? intData.gained : 0) };
        setIntimacy(nextIntimacy);
      }
      setMessages((prev) => {
        const last = prev[prev.length - 1]; const mood = deriveMood(last?.content, nextIntimacy.score);
        saveChatCache(selectedId, { messages: prev.map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at, is_proactive: m.is_proactive, media_url: m.media_url, media_type: m.media_type, status: m.status })), intimacy: nextIntimacy, mood: mood.label });
        return prev;
      });
      void membership.refresh();
    } catch (err) {
      logger.error('Send error:', { data: err });
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: 'failed' } : m));
      if (!opts?.silent) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: msg, created_at: new Date().toISOString() }]);
      }
      setIsTyping(false);
    }
    if (!opts?.silent) setIsSending(false);
  };

  // ── Gift ──
  const clearGiftBurst = useCallback(() => { setGiftBurst(null); }, []);
  const handleSendGift = (gift: ChatGift) => {
    const next = giftComboRef.current + 1; giftComboRef.current = next;
    const isSvga = gift.effect_type === 'svga' || (gift.effect_asset_url || '').toLowerCase().includes('.svga');
    const duration = gift.effect_config?.duration_ms ?? (isSvga ? 4200 : 2800);
    setGiftBurst({ gift, combo: next, key: Date.now() + next, senderName: user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'You' });
    if (giftComboTimer.current) clearTimeout(giftComboTimer.current);
    giftComboTimer.current = setTimeout(() => { giftComboRef.current = 0; }, duration + 1200);
    toast.success(`${gift.emoji} x${next} ${gift.name}`, { description: `+${gift.intimacy_boost * next} intimacy` });
    void sendMessage(`*sends a gift: ${gift.emoji} ${gift.name}*`, { silent: true });
  };

  // ── Outfit ──
  const handleEquipOutfit = (outfitId: string) => {
    setSelectedOutfit(outfitId === selectedOutfit ? null : outfitId);
    const outfit = outfits.find((o) => o.id === outfitId);
    if (outfit && outfitId !== selectedOutfit) {
      setMessages((prev) => [...prev, { id: `outfit-${Date.now()}`, role: 'assistant', content: `${girlfriend?.name ?? 'She'} changed into ${outfit.emoji} ${outfit.name}!`, created_at: new Date().toISOString() }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } };

  // ── Message rows for ChatStream ──
  const renderRows = useMemo<StreamRow[]>(() => {
    const out: StreamRow[] = [];
    let lastDay = ''; let lastRole: 'user' | 'assistant' | null = null; let lastTime = 0;
    (Array.isArray(messages) ? messages : []).forEach((m, i) => {
      try {
        if (!m?.id) return;
        const created = m.created_at || new Date().toISOString();
        const dk = dayKey(created);
        if (dk !== lastDay) { out.push({ type: 'date', key: `date-${dk}-${i}`, label: dateGroupLabel(created, undefined, locale) }); lastDay = dk; lastRole = null; lastTime = 0; }
        const ts = new Date(created).getTime() || 0;
        const role = m.role === 'user' ? 'user' : 'assistant';
        const merged = lastRole === role && Math.abs(ts - lastTime) < 3 * 60_000;
        const showAvatar = role === 'assistant' && !merged;
        out.push({ type: 'msg', key: String(m.id), msg: { ...m, role, created_at: created }, showAvatar, merged });
        lastRole = role; lastTime = ts;
      } catch { /* skip */ }
    });
    return out;
  }, [messages, locale]);

  const levelInfo = getLevelInfo(Number(intimacy?.score) || 0);

  // ── Render ──
  return (
    <div className="h-[100dvh] flex bg-[#0a0a12] overflow-hidden">
      {/* ──── Left sidebar: Friend list ──── */}
      <aside className={cn(
        'flex flex-col border-r border-white/[0.06] bg-[#0e0e18]',
        'w-full md:w-[380px] md:min-w-[380px] md:max-w-[380px]',
        selectedId ? 'hidden md:flex' : 'flex',
      )}>
        {/* Header */}
        <div className="shrink-0 p-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-white tracking-tight">{t('messages.friends') || '密语'}</h1>
            <button type="button" onClick={() => router.push('/create')} className="glass-btn !h-9 !w-9 !rounded-full !p-0 flex items-center justify-center" aria-label="Create">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#ff6ba6]/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search') || 'Search…'}
              className="glass-input w-full h-10 pl-9 pr-9 text-[15px] sm:text-sm"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full glass flex items-center justify-center">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Friend list */}
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-[#ff6ba6]" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              <MessageCircle className="h-8 w-8 text-[#ff6ba6]/40" />
              <p className="text-sm text-white/40">还没有对话 · 去创建开始</p>
              <button type="button" onClick={() => router.push('/create')} className="glass-btn !h-10 !px-4 text-sm">创建女友</button>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {sorted.map((gf) => (
                <FriendRow
                  key={gf.id}
                  friend={gf}
                  lastMsg={lastMessages[gf.id]}
                  score={intimacyMap[gf.id] || loadChatCache(gf.id)?.intimacy?.score || 0}
                  selected={gf.id === selectedId}
                  deleting={deletingId === gf.id}
                  submitting={submittingId === gf.id}
                  tick={tick}
                  onDelete={(g, e) => void deleteFriend(g, e)}
                  onSubmit={(g, e) => void submitForReview(g, e)}
                  onAlbum={handleAlbumClick}
                  onWardrobe={handleWardrobeClick}
                  onClick={() => setSelectedId(gf.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ──── Right panel: Chat area ──── */}
      <main className={cn(
        'flex-1 flex flex-col min-w-0',
        !selectedId ? 'hidden md:flex' : 'flex',
      )}>
        {selectedId && !isLoading && girlfriend ? (
          <div className="relative flex h-full flex-col overflow-hidden">
            {/* Portrait background */}
            {girlfriend?.portrait_url && (
              <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.08]" style={{ backgroundImage: `url(${girlfriend.portrait_url})`, backgroundSize: 'cover', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }} />
            )}
            <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#0b0b12]/70 via-[#0b0b12]/50 to-[#0b0b12]/90" />

            <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
              <ChatAppBar
                girlfriend={girlfriend}
                levelInfo={levelInfo as Parameters<typeof ChatAppBar>[0]['levelInfo']}
                intimacy={intimacy}
                isTyping={isTyping}
                onBack={() => setSelectedId(null)}
                onSelfie={() => void generateSelfie('send me a sexy selfie')}
                isGenerating={isGenerating}
                onMemories={() => setShowMemories(true)}
                onAlbum={() => setShowAlbum(true)}
              />

              {/* Intimacy strip */}
              <div className="shrink-0 px-3 sm:px-4 py-1.5 border-b border-white/[0.05] bg-[#0a0612]/60">
                <div className="flex items-center gap-2 max-w-3xl mx-auto">
                  <Heart className="h-3.5 w-3.5 text-[#FF6BA6] shrink-0" />
                  <span className="text-[11px] text-white/70 shrink-0">Lv.{levelInfo.level} · {levelInfo.title}</span>
                  <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] transition-all duration-500" style={{ width: `${computeProgress(intimacy.score, levelInfo.level)}%` }} />
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0">{Math.round(intimacy.score)} pts</span>
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
                <button onClick={scrollToBottom} className="absolute right-4 bottom-28 z-20 h-10 w-10 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/[0.10] text-[#F0F0F5] flex items-center justify-center shadow-lg active:scale-95 transition-all" aria-label="Scroll to bottom">
                  <ChevronDown className="h-5 w-5" />
                </button>
              )}

              {/* Free-tier quota */}
              {membership.tier === 'free' && !membership.loading && (
                <div className="mx-3 sm:mx-6 mb-1 space-y-1">
                  <div className="flex items-center gap-2 px-1">
                    <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{
                        width: `${Math.min(100, ((Number(membership.todayMessagesCount) || 0) / 40) * 100)}%`,
                        background: (Number(membership.todayMessagesCount) || 0) >= 24 ? 'linear-gradient(90deg, #F59E0B, #EF4444)' : 'linear-gradient(90deg, #FF2D78, #C026D3)',
                      }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-[#8B8BA3] shrink-0">{Number(membership.todayMessagesCount) || 0}/40</span>
                  </div>
                  {!usageBannerDismissed && (Number(membership.todayMessagesCount) || 0) >= 24 && (
                    <div className="flex items-center gap-3 rounded-2xl glass px-4 py-2.5">
                      <p className="flex-1 text-xs text-white/90 leading-snug">{String(t('chat.usageWarning') || '').replace(/\{count\}/g, String(membership.todayMessagesCount ?? 0)).replace(/\{limit\}/g, '40')}</p>
                      <Button size="sm" onClick={() => router.push('/pricing')} className="shrink-0 h-7 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] text-white text-[11px] font-semibold px-3 shadow hover:opacity-90 active:scale-95 transition-all border-0">
                        <Crown className="h-3 w-3 mr-1" />Upgrade
                      </Button>
                      <button onClick={() => setUsageBannerDismissed(true)} className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[#8B8BA3] hover:text-white hover:bg-white/[0.08]" aria-label="Dismiss">
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
                showPresets={showPresets}
                togglePresets={() => setShowPresets((s) => !s)}
                selectedMood={selectedMood}
                setSelectedMood={setSelectedMood}
                selectedPose={selectedPose}
                setSelectedPose={setSelectedPose}
                selectedEnvironment={selectedEnvironment}
                setSelectedEnvironment={setSelectedEnvironment}
                pendingMedia={pendingMedia}
                onPickImage={handlePickImage}
                onClearMedia={clearPendingMedia}
                onToggleVoice={() => void toggleVoiceRecord()}
                isRecording={isRecording}
                voiceSeconds={voiceSeconds}
                smartSuggestions={smartSuggestions}
                smartSuggestionsLoading={smartSuggestionsLoading}
                onSmartSuggestion={(line) => { setSmartSuggestions([]); void sendMessage(line); }}
                gifts={gifts}
                onSendGift={handleSendGift}
                outfits={outfits}
                selectedOutfit={selectedOutfit}
                onEquipOutfit={handleEquipOutfit}
                onSelfie={() => void generateSelfie('send me a sexy selfie')}
                isGenerating={isGenerating}
                onMemories={() => setShowMemories(true)}
              />
            </div>
          </div>
        ) : selectedId && isLoading ? (
          <div className="flex-1 flex items-center justify-center bg-[#0b0b12]">
            <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]" />
          </div>
        ) : (
          /* Placeholder when no friend selected (desktop) */
          <div className="flex-1 flex items-center justify-center bg-[#0a0a12]">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 text-white/10 mx-auto mb-4" />
              <p className="text-white/30 text-sm">选择一个好友开始聊天</p>
            </div>
          </div>
        )}
      </main>

      {/* ──── Sheets & Overlays ──── */}

      {/* Memories Sheet */}
      <Sheet open={showMemories} onOpenChange={setShowMemories}>
        <SheetContent side="right" className="w-full sm:max-w-sm bg-[#0E0E1A]/95 backdrop-blur-2xl border-l border-white/[0.08]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base font-display">
              <BrainCircuit className="h-4 w-4 text-[#FF2D78]" />
              Memories with {girlfriend?.name || 'her'}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 overflow-y-auto max-h-[calc(100vh-8rem)] pb-8 pr-1">
            {loadingMemories ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#8B8BA3]" /></div>
            ) : memories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Heart className="h-8 w-8 text-[#8B8BA3]/30 mb-3" />
                <p className="text-xs text-[#8B8BA3]">{t('chat.noMemoriesYet') || 'No memories yet. Start chatting!'}</p>
              </div>
            ) : (
              memories.map((mem) => (
                <div key={mem.id} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 backdrop-blur-md">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-medium text-[#FF6BA6]/80 uppercase tracking-wider">{mem.category}</span>
                    <span className="text-[10px] text-[#8B8BA3]">{new Date(mem.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-[#F0F0F5]/90 leading-relaxed">{mem.content}</p>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Album Sheet */}
      <Sheet open={showAlbum} onOpenChange={setShowAlbum}>
        <SheetContent side="right" className="w-full sm:max-w-sm bg-[#0E0E1A]/95 backdrop-blur-2xl border-l border-white/[0.08]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base font-display">
              <Camera className="h-4 w-4 text-[#FF2D78]" />
              相册 · {girlfriend?.name || 'her'}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 overflow-y-auto max-h-[calc(100vh-8rem)] pb-8 pr-1">
            {(() => {
              const mediaItems = messages.filter((m) => m.media_url && m.media_url.startsWith('http'));
              if (mediaItems.length === 0) return (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Camera className="h-8 w-8 text-[#8B8BA3]/30 mb-3" />
                  <p className="text-xs text-[#8B8BA3]">还没有相册内容</p>
                </div>
              );
              return (
                <div className="grid grid-cols-3 gap-1.5">
                  {mediaItems.map((m) => (
                    <button key={m.id} type="button" onClick={() => { setShowLightbox(m.media_url!); setShowAlbum(false); }} className="aspect-square rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.06] hover:border-[#FF2D78]/40 transition-colors">
                      {m.media_type === 'video'
                        ? <video src={m.media_url!} className="h-full w-full object-cover" muted preload="metadata" />
                        : <img src={m.media_url!} alt="" className="h-full w-full object-cover" loading="lazy" />}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <GiftEffectOverlay burst={giftBurst} onDone={clearGiftBurst} />

      {/* Lightbox */}
      {showLightbox && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] bg-black/92 flex items-center justify-center p-4" onClick={() => setShowLightbox(null)} onKeyDown={(e) => e.key === 'Escape' && setShowLightbox(null)}>
          <button type="button" className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white z-10" aria-label="Close" onClick={() => setShowLightbox(null)}>
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={showLightbox} alt="Preview" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
