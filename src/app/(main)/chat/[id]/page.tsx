'use client';
import { useTranslation } from '@/lib/i18n/context';
import { dateGroupLabel, dayKey } from '@/lib/chat-utils';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { notifyDataChange } from '@/hooks/useDataSync';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Loader2,
  Heart,
  BrainCircuit,
  ChevronDown,
  X,
  Crown,
  Camera,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { INTIMACY_LEVELS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { useMembership } from '@/hooks/useMembership';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { toast } from 'sonner';
import { ChatAppBar } from '@/components/chat/ChatAppBar';
import { ChatStream } from '@/components/chat/ChatStream';
import { ChatInputBar, type PendingMedia } from '@/components/chat/ChatInputBar';
import type { ChatMessage as Message, ChatGirlfriend as Girlfriend, IntimacyData } from '@/components/chat/types';
import { loadChatCache, saveChatCache, mergeMessages, deriveMood } from '@/lib/chat-cache';
import { parseChatImageIntent, parseVideoIntent } from '@/lib/chat-image-intent';
import { DEFAULT_CHAT_GIFTS, type ChatGift } from '@/lib/gifts/catalog';
import { GiftEffectOverlay, type GiftBurstState } from '@/components/chat/GiftEffectOverlay';
import UpgradeModal from '@/components/UpgradeModal';
import { sanitizeAssistantReply } from '@/lib/chat-reply-sanitize';
import { detectMessageLocale } from '@/lib/chat-locale';


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
  const [gifts, setGifts] = useState<ChatGift[]>(DEFAULT_CHAT_GIFTS);

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
  const [giftBurst, setGiftBurst] = useState<GiftBurstState | null>(null);
  const giftComboRef = useRef(0);
  const giftComboTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showMemories, setShowMemories] = useState(false);
  const [showAlbum, setShowAlbum] = useState(false);
  const [showLightbox, setShowLightbox] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'message_limit' | 'image_limit'>('message_limit');
  // Image-gen UX: cancel flag, session counter, resume-once guard, last request (for retry)
  const cancelGenRef = useRef(false);
  const genSessionRef = useRef(0);
  const resumedGenRef = useRef(false);
  const lastSelfieReqRef = useRef<string>('send me a sexy selfie');
  const [albumMedia, setAlbumMedia] = useState<Array<{ id: string; url: string; media_type: string; created_at?: string }>>([]);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [selectedOutfit, setSelectedOutfit] = useState<string | null>(null);

  // Presets (for chat & selfie)
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedPose, setSelectedPose] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  // Membership & usage banner
  const membership = useMembership();
  const [usageBannerDismissed, setUsageBannerDismissed] = useState(false);

  // AI quick-reply chips (retention)
  const [smartSuggestions, setSmartSuggestions] = useState<string[]>([]);
  const [smartSuggestionsLoading, setSmartSuggestionsLoading] = useState(false);

  // User media (photo / voice) attachment
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    // Live gifts + effects (admin-managed; falls back to defaults)
    fetch('/api/gifts', { cache: 'no-store' })
      .then((r) => r.json().catch(() => ({})))
      .then((d: { gifts?: ChatGift[] }) => {
        if (Array.isArray(d.gifts) && d.gifts.length > 0) setGifts(d.gifts);
      })
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
      try {
        setMessages(mergeMessages([], cached.messages) as Message[]);
      } catch {
        setMessages([]);
      }
      if (cached.intimacy) {
        setIntimacy({
          score: Number(cached.intimacy.score) || 0,
          level: Number(cached.intimacy.level) || 1,
          daily_score_gained: Number(cached.intimacy.daily_score_gained) || 0,
        });
      }
    }
    // Instant name/avatar from session bootstrap (openCompanionChat)
    try {
      const raw = sessionStorage.getItem('soulmate_selected_companion');
      if (raw) {
        const boot = JSON.parse(raw) as { id?: string; name?: string; portrait?: string };
        if (boot?.id === id && boot.name) {
          const bootGirl: Girlfriend = {
            id,
            name: String(boot.name),
            avatar_url: boot.portrait || null,
            portrait_url: boot.portrait || null,
            personality: null,
          };
          setGirlfriend((prev) => prev ?? bootGirl);
        }
      }
    } catch {
      /* ignore */
    }
    try {
      const [gfRes, msgRes, intRes] = await Promise.all([
        authedFetch(`/api/girlfriends?id=${encodeURIComponent(id)}`),
        authedFetch(`/api/chat/${id}`),
        authedFetch(`/api/intimacy?girlfriend_id=${encodeURIComponent(id)}`),
      ]);

      const gfData = await readResponseJson(gfRes).catch(() => ({} as Record<string, unknown>));
      const msgData = await readResponseJson(msgRes).catch(() => ({} as Record<string, unknown>));
      const intData = await readResponseJson(intRes).catch(() => ({} as Record<string, unknown>));

      const gfList = Array.isArray((gfData as { girlfriends?: Girlfriend[] }).girlfriends)
        ? ((gfData as { girlfriends: Girlfriend[] }).girlfriends)
        : [];
      let gf: Girlfriend | null =
        gfList.find((g: Girlfriend) => g.id === id) ||
        gfList[0] ||
        null;

      // Fallback: list all if id filter unsupported / empty
      if (!gf) {
        const all = await authedFetch('/api/girlfriends')
          .then((r) => readResponseJson(r).catch(() => ({})))
          .catch(() => ({}));
        const listed = ((all as { girlfriends?: Girlfriend[] }).girlfriends) || [];
        gf = listed.find((g: Girlfriend) => g.id === id) || null;
      }
      if (gf) {
        setGirlfriend({
          ...gf,
          avatar_url: gf.avatar_url || gf.portrait_url || gf.image_url || null,
          portrait_url: gf.portrait_url || gf.avatar_url || gf.image_url || null,
          card_url: (gf as Record<string, unknown>).card_url as string || gf.portrait_url || null,
        });
      }

      const serverMsgs = Array.isArray((msgData as { messages?: Message[] }).messages)
        ? ((msgData as { messages: Message[] }).messages)
        : [];
      const localMsgs = (cached?.messages || []) as Message[];
      let merged: Message[] = [];
      try {
        merged = mergeMessages(serverMsgs, localMsgs) as Message[];
      } catch (mergeErr) {
        logger.warn('mergeMessages failed, using server only', {
          err: mergeErr instanceof Error ? mergeErr.message : String(mergeErr),
        });
        merged = serverMsgs.length ? serverMsgs : localMsgs;
      }
      setMessages(merged);
      if (typeof (msgData as { hasMore?: boolean }).hasMore === 'boolean') {
        setHasMore(Boolean((msgData as { hasMore: boolean }).hasMore));
      }

      const scores = Array.isArray((intData as { scores?: unknown[] }).scores)
        ? ((intData as {
            scores: Array<{
              girlfriend_id: string;
              score: number;
              level: number;
              daily_score_gained?: number;
            }>;
          }).scores)
        : [];
      const intScore =
        scores.find((s) => s.girlfriend_id === id) || scores[0];
      const nextInt = intScore
        ? {
            score: Number(intScore.score) || 0,
            level: Number(intScore.level) || 1,
            daily_score_gained: Number(intScore.daily_score_gained) || 0,
          }
        : cached?.intimacy
          ? {
              score: Number(cached.intimacy.score) || 0,
              level: Number(cached.intimacy.level) || 1,
              daily_score_gained: Number(cached.intimacy.daily_score_gained) || 0,
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
        try {
          setMessages(mergeMessages([], cached.messages) as Message[]);
        } catch {
          /* ignore */
        }
      }
    }
    setIsLoading(false);
  };

  useAutoRefresh(loadData);

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

  // Daily re-engagement (1–3 msgs) + periodic check while chat is open
  useEffect(() => {
    if (invalidChatId) return;
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await authedFetch('/api/proactive/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ girlfriend_id: id, locale }),
        });
        if (!res.ok || cancelled) return;
        const data = (await readResponseJson(res).catch(() => ({}))) as {
          messages?: Array<{ content?: string; girlfriend_id?: string }>;
          message?: string;
        };
        const list = Array.isArray(data.messages)
          ? data.messages
          : data.message
            ? [{ content: data.message }]
            : [];
        if (!list.length) return;
        setMessages((prev) => [
          ...prev,
          ...list.map((m, i) => ({
            id: `proactive-${Date.now()}-${i}`,
            role: 'assistant' as const,
            content: String(m.content || ''),
            created_at: new Date().toISOString(),
            is_proactive: true,
          })),
        ]);
        // Refresh smart replies for the latest proactive line
        const last = list[list.length - 1]?.content;
        if (last) void fetchSmartSuggestions(String(last));
      } catch {
        /* ignore */
      }
    };
    // First check soon after open, then every 3 min
    const first = setTimeout(() => void tick(), 2500);
    const interval = setInterval(tick, 180_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, locale, invalidChatId]);

  const fetchSmartSuggestions = useCallback(
    async (lastAssistant: string, lastUser?: string) => {
      if (!id || !lastAssistant?.trim()) return;
      setSmartSuggestionsLoading(true);
      try {
        const res = await authedFetch('/api/chat/quick-replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            girlfriend_id: id,
            last_assistant: lastAssistant.slice(0, 600),
            last_user: (lastUser || '').slice(0, 400),
            locale,
          }),
        });
        const data = (await readResponseJson(res).catch(() => ({}))) as {
          replies?: string[];
        };
        if (Array.isArray(data.replies) && data.replies.length) {
          setSmartSuggestions(data.replies.slice(0, 3));
        }
      } catch {
        /* keep previous chips */
      } finally {
        setSmartSuggestionsLoading(false);
      }
    },
    [id, locale],
  );

  // After history load: seed 3 quick replies from last assistant message
  useEffect(() => {
    if (isLoading || !messages.length) return;
    const lastAssist = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
    const lastUser = [...messages].reverse().find((m) => m.role === 'user' && m.content);
    if (lastAssist?.content) {
      void fetchSmartSuggestions(lastAssist.content, lastUser?.content);
    }
    // only when chat finishes initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Auto scroll to bottom on new messages (if user near bottom)
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isTyping, autoScroll]);

  // Fetch album media when album is opened
  useEffect(() => {
    if (!showAlbum || !id) return;
    setAlbumLoading(true);
    authedFetch(`/api/chat/${id}/media`)
      .then((res) => readResponseJson(res).catch(() => ({})))
      .then((data) => {
        const items = Array.isArray((data as { media?: unknown[] }).media)
          ? ((data as { media: Array<{ id: string; url: string; media_type: string; created_at?: string }> }).media)
          : [];
        setAlbumMedia(items.filter((m) => m.url && m.url.startsWith('http')));
      })
      .catch(() => setAlbumMedia([]))
      .finally(() => setAlbumLoading(false));
  }, [showAlbum, id]);

  // Resume an in-flight generation job after page refresh / re-enter
  useEffect(() => {
    if (invalidChatId || !id || isLoading || resumedGenRef.current) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem(`soulmate_gen_job_${id}`); } catch { return; }
    if (!raw) return;
    let job: { job_id?: string; startedAt?: number; req?: string } = {};
    try { job = JSON.parse(raw); } catch { job = {}; }
    const age = Date.now() - (job.startedAt || 0);
    if (!job.job_id || age > 4 * 60 * 1000) {
      clearGenJob(id);
      return;
    }
    resumedGenRef.current = true;
    const zh = String(locale || '').toLowerCase().startsWith('zh');
    const waitId = `selfie-wait-${job.startedAt}`;
    cancelGenRef.current = false;
    const session = ++genSessionRef.current;
    setIsGenerating(true);
    setAutoScroll(true);
    setMessages((prev) => [
      ...prev,
      {
        id: waitId,
        role: 'assistant',
        content: zh
          ? '刚刚的照片还在生成中，我帮你接着等… 💕'
          : 'Your photo is still developing — picking up where we left off… 💕',
        created_at: new Date().toISOString(),
      },
    ]);
    let stopped = false;
    (async () => {
      const remaining = Math.max(5, Math.floor((4 * 60 * 1000 - age) / 3000));
      for (let p = 0; p < remaining; p++) {
        if (stopped || cancelGenRef.current || genSessionRef.current !== session) break;
        await new Promise((r) => setTimeout(r, 3000));
        if (stopped || cancelGenRef.current || genSessionRef.current !== session) break;
        try {
          const res = await authedFetch(
            `/api/runpod/status?job_id=${encodeURIComponent(job.job_id!)}&girlfriend_id=${encodeURIComponent(id)}&scene=chat_selfie`,
          );
          const data = await readResponseJson<{ status?: string; images?: string[] }>(res);
          if (data.status === 'COMPLETED' && data.images?.length) {
            const doneUrl = data.images[0];
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== waitId),
              {
                id: `selfie-${Date.now()}`,
                role: 'assistant',
                content: zh ? '拍好啦～这是专门为你拍的新照片 💕' : "Here's a brand-new photo just for you 💕",
                created_at: new Date().toISOString(),
                media_url: doneUrl,
                media_type: 'image',
              },
            ]);
            break;
          }
          if (data.status === 'FAILED') break;
        } catch {
          /* transient — keep polling */
        }
      }
      if (stopped) return; // unmounted — keep job so next visit can resume
      setMessages((prev) => prev.filter((m) => m.id !== waitId));
      if (genSessionRef.current === session) {
        clearGenJob(id);
        setIsGenerating(false);
      }
    })();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isLoading]);

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

  const uploadUserFile = async (file: File, folder: string): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    const res = await authedFetch('/api/upload', { method: 'POST', body: fd });
    const data = await readResponseJson<{ url?: string; error?: string }>(res);
    if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
    return data.url;
  };

  const handlePickImage = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    if (!/^image\//.test(file.type)) {
      toast.error('Please choose an image file');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingMedia({ kind: 'image', url: previewUrl, previewUrl, file });
  };

  const clearPendingMedia = () => {
    if (pendingMedia?.previewUrl?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(pendingMedia.previewUrl);
      } catch {
        /* ignore */
      }
    }
    setPendingMedia(null);
  };

  const stopVoiceTimer = () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const toggleVoiceRecord = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopVoiceTimer();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 800) {
          toast.error('Recording too short');
          return;
        }
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        const previewUrl = URL.createObjectURL(blob);
        setPendingMedia({ kind: 'audio', url: previewUrl, previewUrl, file });
      };
      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setIsRecording(true);
      setVoiceSeconds(0);
      voiceTimerRef.current = setInterval(() => {
        setVoiceSeconds((s) => {
          if (s >= 59) {
            recorder.stop();
            setIsRecording(false);
            stopVoiceTimer();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      logger.warn('mic denied', { err: err instanceof Error ? err.message : String(err) });
      toast.error('Microphone permission needed for voice notes');
    }
  };

  /* ---------- generation job persistence (resume after refresh) ---------- */
  const saveGenJob = (gid: string, job: { job_id: string; startedAt: number; req: string }) => {
    try { localStorage.setItem(`soulmate_gen_job_${gid}`, JSON.stringify(job)); } catch { /* ignore */ }
  };
  const clearGenJob = (gid: string) => {
    try { localStorage.removeItem(`soulmate_gen_job_${gid}`); } catch { /* ignore */ }
  };

  /** User pressed X on the generating card — stop polling & clean up */
  const handleCancelGeneration = () => {
    if (cancelGenRef.current) return;
    cancelGenRef.current = true;
    setIsTyping(false);
    setMessages((prev) =>
      prev.filter(
        (m) =>
          !String(m.id).startsWith('selfie-wait-') &&
          !String(m.id).startsWith('video-wait-'),
      ),
    );
    clearGenJob(id);
    const zh = String(locale || '').toLowerCase().startsWith('zh');
    toast.message(zh ? '已取消，照片不拍了～' : 'Cancelled — no photo this time');
  };

  /** Generate a photo of the girlfriend from optional user request (auto or button). */
  const generateSelfie = async (
    userRequest?: string,
    extraContext?: Array<{ role: string; content: string }>,
  ) => {
    if (isGenerating) {
      const busyZh =
        /[\u4e00-\u9fff]/.test(userRequest || '') ||
        String(locale || '').toLowerCase().startsWith('zh');
      toast.message(busyZh ? '她已经在拍照了，稍等一下…' : 'She is already taking a photo, hold on…');
      return;
    }
    cancelGenRef.current = false;
    const session = ++genSessionRef.current;
    setIsGenerating(true);
    const req = (userRequest || 'send me a sexy selfie').trim();
    lastSelfieReqRef.current = req;

    // Girlfriend "I'm taking a photo" wait message — match user language
    const waitZh =
      /[\u4e00-\u9fff]/.test(req) ||
      String(locale || '').toLowerCase().startsWith('zh');
    const waitText = waitZh
      ? '我正在为你拍一张全新的照片哦，稍等我换个姿势和场景，拍好就发给你 💕'
      : "I'm taking a brand-new photo for you—give me a moment to change the pose and scene 💕";
    const waitId = `selfie-wait-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: waitId,
        role: 'assistant',
        content: waitText,
        created_at: new Date().toISOString(),
      },
    ]);
    setIsTyping(true);
    setAutoScroll(true);
    toast.message(waitZh ? '她正在拍一张新照片…' : 'She is taking a new photo…', {
      description: waitZh
        ? '正在根据聊天内容更换场景和姿势，请稍候。'
        : 'Matching the scene and pose to your conversation.',
    });

    try {
      // Recent chat so the photo matches the conversation
      const fromState = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map((m) => ({
          role: m.role,
          content: String(m.content || '').slice(0, 400),
        }));
      const chat_context = [...fromState, ...(extraContext || [])].slice(-10);

      const res = await authedFetch('/api/chat/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          girlfriend_id: id,
          user_request: req,
          message: req,
          chat_context,
          mood: selectedMood,
          pose: selectedPose,
          environment: selectedEnvironment,
          locale,
        }),
      });
      const data = await readResponseJson<{
        error?: string;
        localized_error?: string;
        code?: string;
        image_url?: string;
        imageUrl?: string;
        message?: string;
        pending?: boolean;
        job_id?: string;
        status?: string;
      }>(res);
      if (!res.ok) {
        if (data?.code === 'daily_limit') {
          setUpgradeReason('image_limit');
          setUpgradeOpen(true);
        }
        const msg =
          data?.code === 'daily_limit'
            ? (data.localized_error || t('chat.imageDailyLimit'))
            : waitZh
              ? t('chat.imageFailed')
              : (data?.localized_error || data?.error || t('chat.imageFailed'));
        throw new Error(msg);
      }

      // Handle async pending — poll until GPU finishes
      let imageUrl = data.image_url || data.imageUrl;
      let caption = data.message;
      if (data.pending && data.job_id) {
        let jobId = data.job_id;
        let retried = false;
        let falAttempted = false;
        saveGenJob(id, { job_id: jobId, startedAt: Date.now(), req });
        const pollStatus = async (jid: string): Promise<{ url?: string; failed?: boolean; error?: string; cancelled?: boolean }> => {
          for (let p = 0; p < 80; p++) {
            if (cancelGenRef.current || genSessionRef.current !== session) return { cancelled: true };
            await new Promise((r) => setTimeout(r, 3000));
            if (cancelGenRef.current || genSessionRef.current !== session) return { cancelled: true };
            try {
              const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(jid)}&girlfriend_id=${encodeURIComponent(id)}&scene=chat_selfie`);
              const pollData = await readResponseJson<{ status?: string; images?: string[]; error?: string }>(pollRes);
              if (pollData.status === 'COMPLETED' && Array.isArray(pollData.images) && pollData.images.length > 0) {
                return { url: pollData.images[0] };
              }
              if (pollData.status === 'FAILED') {
                return { failed: true, error: pollData.error || 'Image generation failed' };
              }
              // After 30s in queue, try fal.ai fast fallback
              if (p === 10 && !falAttempted) {
                falAttempted = true;
                setMessages((prev) => prev.map((m) => m.id === waitId ? {
                  ...m,
                  content: waitZh ? 'GPU 有点忙，我换个更快的方式给你拍… ⚡' : 'GPU is busy, switching to a faster method… ⚡',
                } : m));
                try {
                  const falRes = await authedFetch('/api/chat/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      girlfriend_id: id, user_request: req, message: req,
                      chat_context, mood: selectedMood, pose: selectedPose,
                      environment: selectedEnvironment, locale, provider: 'fal',
                    }),
                  });
                  const falData = await readResponseJson<{ image_url?: string; imageUrl?: string; error?: string }>(falRes);
                  const falUrl = falData.image_url || falData.imageUrl;
                  if (falUrl) return { url: falUrl };
                } catch {
                  // fal.ai not available — continue polling RunPod
                }
              }
              // Progress updates
              if (p === 5) {
                setMessages((prev) => prev.map((m) => m.id === waitId ? {
                  ...m,
                  content: waitZh ? '还在排队中，GPU 正在热身…再等我一小会儿 💕' : 'Still in queue, GPU is warming up… just a little longer 💕',
                } : m));
              }
              if (p === 20) {
                setMessages((prev) => prev.map((m) => m.id === waitId ? {
                  ...m,
                  content: waitZh ? '正在生成中，马上就好… 📸' : 'Generating now, almost there… 📸',
                } : m));
              }
            } catch {
              // Transient network error — keep polling
            }
          }
          return { failed: true, error: 'timeout' };
        };

        let result = await pollStatus(jobId);

        // User cancelled mid-generation — cleanup already done in handleCancelGeneration
        if (result.cancelled) {
          clearGenJob(id);
          setIsTyping(false);
          if (genSessionRef.current === session) setIsGenerating(false);
          return;
        }

        // Auto-retry once on failure
        if (result.failed && !retried && !cancelGenRef.current && genSessionRef.current === session) {
          retried = true;
          setMessages((prev) => prev.map((m) => m.id === waitId ? {
            ...m,
            content: waitZh ? '第一次没成功，我再试一次… 💪' : 'First attempt failed, trying again… 💪',
          } : m));
          try {
            const retryRes = await authedFetch('/api/chat/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                girlfriend_id: id,
                user_request: req,
                message: req,
                chat_context,
                mood: selectedMood,
                pose: selectedPose,
                environment: selectedEnvironment,
                locale,
              }),
            });
            const retryData = await readResponseJson<{ pending?: boolean; job_id?: string; image_url?: string; imageUrl?: string }>(retryRes);
            if (retryData.image_url || retryData.imageUrl) {
              result = { url: retryData.image_url || retryData.imageUrl };
            } else if (retryData.pending && retryData.job_id) {
              jobId = retryData.job_id;
              saveGenJob(id, { job_id: jobId, startedAt: Date.now(), req });
              result = await pollStatus(jobId);
              if (result.cancelled) {
                clearGenJob(id);
                setIsTyping(false);
                if (genSessionRef.current === session) setIsGenerating(false);
                return;
              }
            }
          } catch {
            // Retry submit failed — fall through to error
          }
        }

        if (result.url) {
          imageUrl = result.url;
          clearGenJob(id);
          caption = waitZh ? '拍好啦～这是专门为你拍的新照片 💕' : "Here's a brand-new photo just for you 💕";
        } else {
          throw new Error(waitZh ? 'GPU 排队超时，请稍后再试' : 'GPU queue timeout, please try again');
        }
      }

      setIsTyping(false);
      if (imageUrl) {
        const readyText = caption || (waitZh
          ? '拍好啦～这是专门为你拍的新照片 💕'
          : "Here's a brand-new photo just for you 💕");
        const newMsg: Message = {
          id: `selfie-${Date.now()}`,
          role: 'assistant',
          content: readyText,
          created_at: new Date().toISOString(),
          media_url: imageUrl,
          media_type: 'image',
        };
        setMessages((prev) => [...prev, newMsg]);
        const waitMsg: Message = {
          id: waitId,
          role: 'assistant',
          content: waitText,
          created_at: new Date().toISOString(),
        };
        saveChatCache(id, {
          messages: [...messages, waitMsg, newMsg].slice(-200).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            media_url: m.media_url,
            media_type: m.media_type,
            is_proactive: m.is_proactive,
            status: m.status,
          })),
        });
      }
    } catch (err) {
      setIsTyping(false);
      clearGenJob(id);
      logger.error('Generate selfie error:', { data: err });
      setMessages((prev) => prev.filter((message) => message.id !== waitId));
      const failText = err instanceof Error ? err.message : t('chat.imageFailed');
      const sorry = waitZh
        ? `${failText} 稍后再让我试一次好不好？`
        : `Photo glitched… ${failText} Want me to try again?`;
      setMessages((prev) => [
        ...prev,
        {
          id: `selfie-err-${Date.now()}`,
          role: 'assistant',
          content: sorry,
          created_at: new Date().toISOString(),
        },
      ]);
    }
    setIsGenerating(false);
  };

  /** Generate a short video: first create an image, then animate it via RunPod SVD */
  const generateVideo = async (userRequest?: string) => {
    if (isGenerating) {
      const busyZh =
        /[\u4e00-\u9fff]/.test(userRequest || '') ||
        String(locale || '').toLowerCase().startsWith('zh');
      toast.message(busyZh ? '她正在生成中，稍等一下…' : 'She is already generating something, hold on…');
      return;
    }
    cancelGenRef.current = false;
    const session = ++genSessionRef.current;
    setIsGenerating(true);
    const waitZh = /[\u4e00-\u9fff]/.test(userRequest || '') || String(locale || '').toLowerCase().startsWith('zh');
    const waitText = waitZh
      ? '我正在为你录一段小视频哦，先拍张照片再让它动起来，稍等 💕'
      : "I'm making a short video for you—taking a photo first, then animating it. Hold on 💕";
    const waitId = `video-wait-${Date.now()}`;
    setMessages((prev) => [...prev, { id: waitId, role: 'assistant', content: waitText, created_at: new Date().toISOString() }]);

    try {
      // Step 1: Generate an image first
      const imgRes = await authedFetch('/api/chat/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ girlfriend_id: id, user_request: userRequest || 'send me a selfie', locale }),
      });
      const imgData = await readResponseJson<{ image_url?: string; imageUrl?: string; pending?: boolean; job_id?: string; error?: string }>(imgRes);
      if (!imgRes.ok) throw new Error(imgData.error || 'Image generation failed');

      let imageUrl = imgData.image_url || imgData.imageUrl;
      // Handle pending image
      if (!imageUrl && imgData.pending && imgData.job_id) {
        for (let p = 0; p < 60; p++) {
          if (cancelGenRef.current || genSessionRef.current !== session) {
            if (genSessionRef.current === session) setIsGenerating(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 3000));
          if (p === 5) {
            setMessages((prev) => prev.map((m) => m.id === waitId ? {
              ...m,
              content: waitZh ? '照片还在排队中，GPU 正在热身… 💕' : 'Photo still in queue, GPU is warming up… 💕',
            } : m));
          }
          const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(imgData.job_id)}`);
          const pollData = await readResponseJson<{ status?: string; images?: string[] }>(pollRes);
          if (pollData.status === 'COMPLETED' && pollData.images?.length) { imageUrl = pollData.images[0]; break; }
          if (pollData.status === 'FAILED') throw new Error('Image generation failed');
        }
      }
      if (!imageUrl) throw new Error('No image generated for video');

      // Step 2: Generate video from the image
      const vidRes = await authedFetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_image: imageUrl, girlfriend_id: id }),
      });
      const vidData = await readResponseJson<{ video_url?: string; pending?: boolean; job_id?: string; error?: string }>(vidRes);
      if (!vidRes.ok) throw new Error(vidData.error || 'Video generation failed');

      let videoUrl = vidData.video_url;
      // Handle pending video
      if (!videoUrl && vidData.pending && vidData.job_id) {
        for (let p = 0; p < 60; p++) {
          if (cancelGenRef.current || genSessionRef.current !== session) {
            if (genSessionRef.current === session) setIsGenerating(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 3000));
          if (p === 3) {
            setMessages((prev) => prev.map((m) => m.id === waitId ? {
              ...m,
              content: waitZh ? '照片拍好了，正在让它动起来… 🎬' : 'Photo ready, now animating it… 🎬',
            } : m));
          }
          if (p === 15) {
            setMessages((prev) => prev.map((m) => m.id === waitId ? {
              ...m,
              content: waitZh ? '视频渲染中，马上就好… 💕' : 'Rendering video, almost there… 💕',
            } : m));
          }
          const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(vidData.job_id)}`);
          const pollData = await readResponseJson<{ status?: string; images?: string[] }>(pollRes);
          if (pollData.status === 'COMPLETED' && pollData.images?.length) { videoUrl = pollData.images[0]; break; }
          if (pollData.status === 'FAILED') throw new Error('Video generation failed');
        }
      }
      if (!videoUrl) throw new Error(waitZh ? '视频生成超时' : 'Video generation timed out');

      // Show video in chat
      const caption = waitZh ? '给你录了一段小视频～看看我动起来的样子 💕' : "Here's a little video just for you～ see me move 💕";
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== waitId),
        { id: `video-${Date.now()}`, role: 'assistant', content: caption, created_at: new Date().toISOString(), media_url: videoUrl, media_type: 'video' },
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== waitId));
      const failText = err instanceof Error ? err.message : 'Video failed';
      setMessages((prev) => [...prev, {
        id: `video-err-${Date.now()}`, role: 'assistant',
        content: waitZh ? `视频生成失败了… ${failText} 稍后再试好不好？` : `Video glitched… ${failText} Want me to try again?`,
        created_at: new Date().toISOString(),
      }]);
    }
    setIsGenerating(false);
  };

  const sendMessage = async (
    overrideText?: string,
    opts?: { /** Gift path: never lock UI / never wait on the gift panel */ silent?: boolean },
  ) => {
    const text = (overrideText ?? input).trim();
    const media = opts?.silent ? null : pendingMedia;
    // Silent gift sends can run in parallel with a normal send
    if ((!text && !media) || (isSending && !opts?.silent)) return;

    if (!opts?.silent) {
      setInput('');
      setSmartSuggestions([]);
      clearPendingMedia();
      setIsSending(true);
    }
    const mediaSnapshot = opts?.silent ? null : media;
    setAutoScroll(true);

    let mediaUrl: string | undefined;
    let mediaType: string | undefined;
    try {
      if (mediaSnapshot?.file) {
        toast.message(mediaSnapshot.kind === 'audio' ? 'Uploading voice…' : 'Uploading photo…');
        mediaUrl = await uploadUserFile(
          mediaSnapshot.file,
          mediaSnapshot.kind === 'audio' ? `chat_voice/${id}` : `chat_user/${id}`,
        );
        mediaType = mediaSnapshot.kind;
      } else if (mediaSnapshot?.url?.startsWith('http')) {
        mediaUrl = mediaSnapshot.url;
        mediaType = mediaSnapshot.kind;
      }
    } catch (upErr) {
      setIsSending(false);
      toast.error(upErr instanceof Error ? upErr.message : 'Upload failed');
      if (mediaSnapshot) setPendingMedia(mediaSnapshot);
      return;
    }

    const displayText =
      text ||
      (mediaType === 'audio' ? '[Voice message]' : mediaType === 'image' ? '[Photo]' : '');

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: 'user',
        content: displayText,
        created_at: new Date().toISOString(),
        status: 'sending',
        media_url: mediaUrl || mediaSnapshot?.previewUrl || null,
        media_type: mediaType || null,
      },
    ]);

    const wantsPhoto = parseChatImageIntent(text).wantsImage;
    const wantsVideo = parseVideoIntent(text);
    const detectedTurnLocale = detectMessageLocale(text);
    const replyPreferZh =
      detectedTurnLocale === 'zh' ||
      (detectedTurnLocale == null && String(locale || '').toLowerCase().startsWith('zh'));

    try {
      const res = await authedFetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text || displayText,
          girlfriend_id: id,
          mood: selectedMood,
          pose: selectedPose,
          environment: selectedEnvironment,
          locale,
          ...(mediaUrl ? { media_url: mediaUrl, media_type: mediaType } : {}),
        }),
      });

      if (!res.ok) {
        const errBody = (await readResponseJson(res).catch(() => ({}))) as {
          error?: string;
          localized_error?: string;
          code?: string;
        };
        if (errBody.code === 'daily_message_limit') {
          setUpgradeReason('message_limit');
          setUpgradeOpen(true);
        }
        throw new Error(
          typeof errBody?.localized_error === 'string'
            ? errBody.localized_error
            : errBody.code === 'daily_message_limit'
              ? t('chat.messageDailyLimit')
              : locale === 'zh'
                ? t('chat.sendFailed')
                : typeof errBody?.error === 'string'
            ? errBody.error
            : `${t('chat.sendFailed')} (${res.status})`,
        );
      }
      const ch = res.headers.get('X-AI-Channel');
      const md = res.headers.get('X-AI-Model');
      if (ch === 'sfw' || ch === 'nsfw') setAiChannel(ch);
      if (md) setAiModel(md);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, status: 'sent', media_url: mediaUrl || m.media_url, media_type: mediaType || m.media_type }
            : m,
        ),
      );

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let sseBuf = '';
      setIsTyping(true);

      const assistId = `assist-${Date.now()}`;
      let assistInserted = false;

      const pushAssist = (content: string) => {
        if (!content) return;
        if (!assistInserted) {
          assistInserted = true;
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: assistId,
              role: 'assistant',
              content,
              created_at: new Date().toISOString(),
            },
          ]);
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistId ? { ...m, content } : m)),
          );
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuf += decoder.decode(value, { stream: true });
        const parts = sseBuf.split('\n');
        sseBuf = parts.pop() || '';

        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6)) as {
              error?: string;
              content?: string;
              replace?: string;
            };
            if (json.error) {
              logger.error('Stream error:', { data: json.error });
              continue;
            }
            // Server final sanitize may replace the whole reply
            if (typeof json.replace === 'string' && json.replace.length) {
              fullContent = sanitizeAssistantReply(json.replace, {
                preferZh: replyPreferZh,
              });
              pushAssist(fullContent);
              continue;
            }
            if (json.content) {
              fullContent += json.content;
              pushAssist(fullContent);
            }
          } catch {
            /* incomplete / skip */
          }
        }
      }

      // Client-side sanitize as last line of defense
      if (fullContent) {
        const cleaned = sanitizeAssistantReply(fullContent, {
          preferZh: replyPreferZh,
        });
        if (cleaned !== fullContent) {
          fullContent = cleaned;
          pushAssist(fullContent);
        }
      }

      setIsTyping(false);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'read' } : m)));

      // 3 AI quick-reply chips for next turn (retention)
      if (fullContent) {
        void fetchSmartSuggestions(fullContent, text);
      }

      // Auto-trigger photo that matches this chat turn when user asked for one
      if (wantsPhoto && text) {
        void generateSelfie(text, [
          { role: 'user', content: text },
          ...(fullContent ? [{ role: 'assistant', content: fullContent.slice(0, 400) }] : []),
        ]);
      }

      // Auto-trigger video generation when user asked for a video/animation
      if (wantsVideo && text) {
        void generateVideo(text);
      }

      const intRes = await authedFetch('/api/intimacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ girlfriend_id: id, message_type: 'normal' }),
      });
      const intData = (await readResponseJson(intRes).catch(() => ({}))) as {
        score?: number;
        level?: number;
        gained?: number;
      };
      let nextIntimacy = intimacy;
      if (typeof intData.score === 'number') {
        nextIntimacy = {
          score: intData.score,
          level: typeof intData.level === 'number' ? intData.level : 1,
          daily_score_gained:
            (intimacy.daily_score_gained || 0) +
            (typeof intData.gained === 'number' ? intData.gained : 0),
        };
        setIntimacy(nextIntimacy);
      }

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
            media_type: m.media_type,
            status: m.status,
          })),
          intimacy: nextIntimacy,
          mood: mood.label,
        });
        return prev;
      });

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
      notifyDataChange('chat');
      notifyDataChange('membership');

      void authedFetch('/api/v2/user/achievements')
        .then((r) => readResponseJson(r).catch(() => ({})))
        .then((data: unknown) => {
          const payload = data as {
            achievements?: Array<{
              name?: string;
              reward_tokens?: number;
              user_progress?: { unlocked?: boolean; reward_claimed?: boolean };
            }>;
          };
          const newUnlocks = (payload.achievements || []).filter(
            (a) => a.user_progress?.unlocked && !a.user_progress?.reward_claimed,
          );
          if (newUnlocks.length > 0) {
            toast.success(`🏆 Achievement Unlocked: ${newUnlocks[0].name}!`, {
              description: `+${newUnlocks[0].reward_tokens} tokens`,
              duration: 4000,
            });
          }
        })
        .catch(() => {});
    } catch (err) {
      logger.error('Send error:', { data: err });
      const msg = err instanceof Error ? err.message : t('chat.sendFailed');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      if (!opts?.silent) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: msg === t('chat.messageDailyLimit') || /次数已用完|daily message limit/i.test(msg)
              ? msg
              : locale === 'zh'
                ? `${t('chat.sendFailed')} 请再发送一次。`
                : `I missed that for a second... ${msg}. Try sending again?`,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setIsTyping(false);
    }
    if (!opts?.silent) setIsSending(false);
  };

  /** Retry chip on selfie failure bubble — re-run last photo request */
  const handleRetrySelfie = () => {
    void generateSelfie(lastSelfieReqRef.current);
  };

  /** Retry a failed user message — drop the failed bubble and resend */
  const handleRetryMessage = (msg: Message) => {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    void sendMessage(msg.content);
  };

  const clearGiftBurst = useCallback(() => {
    setGiftBurst(null);
  }, []);

  const handleSendGift = (gift: ChatGift) => {
    // 1) Instant FX — never wait for chat stream or gift panel
    const next = giftComboRef.current + 1;
    giftComboRef.current = next;
    const isSvga =
      gift.effect_type === 'svga' ||
      (gift.effect_asset_url || '').toLowerCase().includes('.svga');
    const duration = gift.effect_config?.duration_ms ?? (isSvga ? 4200 : 2800);

    setGiftBurst({
      gift,
      combo: next,
      key: Date.now() + next,
      senderName: user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'You',
    });

    if (giftComboTimer.current) clearTimeout(giftComboTimer.current);
    // Combo reset timer: only zeroes the combo counter, does NOT unmount the
    // burst overlay. Unmounting is driven by GiftEffectOverlay's onDone,
    // which fires when SvgaPlayer.onFinished (or the fallback timer inside
    // the overlay) completes — so SVGA animations are allowed to play out
    // fully instead of being truncated at duration + 1200ms.
    giftComboTimer.current = setTimeout(() => {
      giftComboRef.current = 0;
    }, duration + 1200);

    toast.success(`${gift.emoji} x${next} ${gift.name}`, {
      description: `+${gift.intimacy_boost * next} intimacy`,
    });

    // 2) Background chat line — silent = no isSending lock, gift panel stays usable for combo
    void sendMessage(`*sends a gift: ${gift.emoji} ${gift.name}*`, { silent: true });
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
          out.push({ type: 'date', key: `date-${dk}-${i}`, label: dateGroupLabel(created, undefined, locale) });
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
  }, [messages, locale]);

  // Lightbox: ordered list of chat images for prev/next navigation
  const lightboxImages = useMemo(
    () =>
      (Array.isArray(messages) ? messages : [])
        .filter(
          (m) =>
            m.media_url &&
            String(m.media_url).startsWith('http') &&
            m.media_type !== 'video' &&
            m.media_type !== 'audio',
        )
        .map((m) => String(m.media_url)),
    [messages],
  );

  const navLightbox = (dir: 1 | -1) => {
    if (!showLightbox || lightboxImages.length < 2) return;
    const idx = lightboxImages.indexOf(showLightbox);
    const next = (idx + dir + lightboxImages.length) % lightboxImages.length;
    setShowLightbox(lightboxImages[next]);
  };

  const downloadLightboxImage = async () => {
    if (!showLightbox) return;
    const zh = String(locale || '').toLowerCase().startsWith('zh');
    try {
      const res = await fetch(showLightbox);
      const blob = await res.blob();
      const ext = (blob.type || '').includes('png') ? 'png' : 'jpg';
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `ozmate-photo-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
      toast.success(zh ? '照片已保存' : 'Photo saved');
    } catch {
      window.open(showLightbox, '_blank');
    }
  };

  if (invalidChatId) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center bg-[#0b0b12] px-6">
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
      <div className="flex h-[100dvh] items-center justify-center bg-[#0b0b12]">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]" />
      </div>
    );
  }

  if (!girlfriend) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#0b0b12] px-6">
        <div className="text-center">
          <p className="text-white/40">{t('chat.companionNotFound') || 'Companion not found'}</p>
          <Button variant="outline" className="mt-4 border-white/15 text-white" onClick={() => router.push('/chats')}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const quotaLimit = Number.isFinite(membership.capabilities.dailyMessageLimit)
    ? (membership.capabilities.dailyMessageLimit as number)
    : 40;
  const quotaWarnAt = Math.ceil(quotaLimit * 0.6);

  const usageText = String(t('chat.usageWarning') || '')
    .replace(/\{count\}/g, String(membership.todayMessagesCount ?? 0))
    .replace(/\{limit\}/g, String(membership.capabilities?.dailyMessageLimit === Number.POSITIVE_INFINITY ? '∞' : (membership.capabilities?.dailyMessageLimit || 40)));

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#0b0b12] text-white">
      {/* Girlfriend standing portrait background at 30% opacity */}
      {(girlfriend?.card_url || girlfriend?.portrait_url) && (
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-30"
          style={{
            backgroundImage: `url(${girlfriend.card_url || girlfriend.portrait_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}
      {/* Dark gradient overlay for readability */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#0b0b12]/70 via-[#0b0b12]/50 to-[#0b0b12]/90" />

      {/* Content layer above background */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
      <ChatAppBar
        girlfriend={girlfriend}
        levelInfo={levelInfo}
        intimacy={intimacy}
        isTyping={isTyping}
        onBack={() => router.push('/chats')}
        onSelfie={generateSelfie}
        isGenerating={isGenerating}
        onMemories={() => setShowMemories(true)}
        onAlbum={() => setShowAlbum(true)}
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
            {t('chat.pointsHeat', { count: Math.round(intimacy.score) })}
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
        onCancelGeneration={handleCancelGeneration}
        onRetrySelfie={handleRetrySelfie}
        onRetryMessage={handleRetryMessage}
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

      {(membership.tier === 'free' || membership.tier === 'basic') && !membership.loading && (
        <div className="mx-3 sm:mx-6 mb-1 space-y-1">
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((Number(membership.todayMessagesCount) || 0) / quotaLimit) * 100)}%`,
                  background:
                    (Number(membership.todayMessagesCount) || 0) >= quotaWarnAt
                      ? 'linear-gradient(90deg, #F59E0B, #EF4444)'
                      : 'linear-gradient(90deg, #FF2D78, #C026D3)',
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-[#8B8BA3] shrink-0">
              {Number(membership.todayMessagesCount) || 0}/{quotaLimit}
            </span>
          </div>
          {!usageBannerDismissed && (Number(membership.todayMessagesCount) || 0) >= quotaWarnAt && (
            <div className="flex items-center gap-3 rounded-2xl glass px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/90 leading-snug">{usageText}</p>
              </div>
              <Button
                size="sm"
                onClick={() => router.push('/pricing')}
                className="shrink-0 h-8 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] text-white text-[11px] font-semibold px-4 shadow-[0_2px_10px_rgba(255,45,120,0.35)] hover:opacity-90 active:scale-95 transition-all border-0"
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
        onSmartSuggestion={(line) => {
          setSmartSuggestions([]);
          void sendMessage(line);
        }}
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

      {/* Album Sheet — gallery of all media from this conversation + stored media */}
      <Sheet open={showAlbum} onOpenChange={setShowAlbum}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-sm bg-[#0E0E1A]/95 backdrop-blur-2xl border-l border-white/[0.08]"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base font-display">
              <Camera className="h-4 w-4 text-[#FF2D78]" />
              相册 · {girlfriend?.name || "her"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 overflow-y-auto max-h-[calc(100vh-8rem)] pb-8 pr-1">
            {(() => {
              // Combine message media + stored album media, deduplicate by URL
              const msgMedia = messages
                .filter((m) => m.media_url && m.media_url.startsWith('http'))
                .map((m) => ({ id: m.id, url: m.media_url!, media_type: m.media_type || 'image' }));
              const seen = new Set(msgMedia.map((m) => m.url));
              const extraMedia = albumMedia.filter((m) => !seen.has(m.url));
              const allMedia = [...msgMedia, ...extraMedia];

              if (albumLoading) {
                return (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]/60" />
                  </div>
                );
              }
              if (allMedia.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Camera className="h-8 w-8 text-[#8B8BA3]/30 mb-3" />
                    <p className="text-xs text-[#8B8BA3]">
                      还没有相册内容，聊天中生成的图片和视频会保存在这里
                    </p>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-3 gap-1.5">
                  {allMedia.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setShowLightbox(m.url); setShowAlbum(false); }}
                      className="aspect-square rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.06] hover:border-[#FF2D78]/40 transition-colors"
                    >
                      {m.media_type === 'video' ? (
                        <video
                          src={m.url}
                          className="h-full w-full object-cover"
                          muted
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={m.url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <GiftEffectOverlay burst={giftBurst} onDone={clearGiftBurst} />

      <UpgradeModal open={upgradeOpen} reason={upgradeReason} onClose={() => setUpgradeOpen(false)} />

      {/* Image Lightbox — download + prev/next navigation */}
      {showLightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-black/92 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowLightbox(null);
            if (e.key === 'ArrowRight') navLightbox(1);
            if (e.key === 'ArrowLeft') navLightbox(-1);
          }}
        >
          <button
            type="button"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10 transition-colors"
            aria-label="Close"
            onClick={() => setShowLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>

          {lightboxImages.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10 transition-colors"
                aria-label="Previous"
                onClick={(e) => { e.stopPropagation(); navLightbox(-1); }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10 transition-colors"
                aria-label="Next"
                onClick={(e) => { e.stopPropagation(); navLightbox(1); }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={showLightbox}
            alt="Preview"
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Bottom action bar: counter + download */}
          <div
            className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-white/10 backdrop-blur-md px-4 py-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxImages.length > 1 && (
              <span className="text-[11px] font-mono tabular-nums text-white/70">
                {Math.max(1, lightboxImages.indexOf(showLightbox) + 1)}/{lightboxImages.length}
              </span>
            )}
            <button
              type="button"
              onClick={() => void downloadLightboxImage()}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_2px_10px_rgba(255,45,120,0.35)] hover:opacity-90 active:scale-95 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              {t('chat.download')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

