'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/lib/i18n/context';
import { Volume2, Square, Loader2, Mic } from 'lucide-react';
import { VOICE_EMOTIONS, emotionLabel } from '@/lib/tts-emotion';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';

interface CompanionVoice {
  id: string;
  name: string;
  avatar_url?: string;
  has_voice: boolean;
}

export default function VoicePage() {
  const { t, locale } = useTranslation();
  const [companions, setCompanions] = useState<CompanionVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch user's companions (authedFetch injects the required x-session header)
  useEffect(() => {
    authedFetch('/api/girlfriends')
      .then(r => r.json())
      .then(data => {
        const items: CompanionVoice[] = (data.items || data || []).map((g: { id: string; name: string; avatar_url?: string; voice?: unknown }) => ({
          id: g.id,
          name: g.name,
          avatar_url: g.avatar_url,
          has_voice: Boolean(g.voice),
        }));
        setCompanions(items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // TTS speak function
  const speak = async (companionId: string, companionName: string) => {
    if (speakingId === companionId) {
      // Stop
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeakingId(null);
      return;
    }

    audioRef.current?.pause();
    setGenerating(companionId);

    try {
      const text = locale === 'zh'
        ? `\u4f60\u597d\uff0c\u6211\u662f${companionName}\u3002\u5f88\u9ad8\u5174\u8ba4\u8bc6\u4f60\uff0c\u4eca\u5929\u60f3\u804a\u4e9b\u4ec0\u4e48\u5462\uff1f`
        : `Hi there, I'm ${companionName}. So happy to meet you! What shall we talk about today?`;

      const res = await authedFetch('/api/ai/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, girlfriend_id: companionId }),
      });

      if (!res.ok) throw new Error('TTS failed');
      const data = await res.json();

      if (data.audio_url) {
        const audio = new Audio(data.audio_url);
        audioRef.current = audio;
        audio.onended = () => { setSpeakingId(null); audioRef.current = null; };
        audio.onerror = () => { setSpeakingId(null); audioRef.current = null; };
        await audio.play();
        setSpeakingId(companionId);
      }
    } catch (e) {
      logger.error('TTS error', { err: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#08040e] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Volume2 className="h-6 w-6 text-[#ff6ba6]" />
            {t('voice.title')}
          </h1>
          <p className="text-white/50 mt-2">{t('voice.description')}</p>
        </div>

        {/* Companion voice cards */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">{t('voice.companionVoices') || 'Companion Voices'}</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : companions.length === 0 ? (
            <p className="text-white/40">{t('voice.noCompanions') || 'No companions yet'}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {companions.map(c => (
                <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-4">
                  {c.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic external storage URL
                    <img src={c.avatar_url} alt={c.name} className="h-12 w-12 rounded-full object-contain" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center">
                      <Mic className="h-5 w-5 text-white/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-white/40">
                      {c.has_voice ? (t('voice.voiceConfigured') || 'Voice configured') : (t('voice.voiceNotConfigured') || 'No voice')}
                    </div>
                  </div>
                  <button
                    onClick={() => speak(c.id, c.name)}
                    disabled={generating === c.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff6ba6]/10 text-[#ff6ba6] hover:bg-[#ff6ba6]/20 transition-colors text-sm disabled:opacity-50"
                  >
                    {generating === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : speakingId === c.id ? (
                      <Square className="h-3 w-3 fill-current" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                    {generating === c.id ? t('chat.speakLoading') : speakingId === c.id ? t('chat.stopSpeak') : t('chat.speak')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Emotion presets showcase */}
        <section>
          <h2 className="text-lg font-semibold mb-4">{t('voice.emotionPresets') || 'Voice Emotions'}</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(VOICE_EMOTIONS).map(([id]) => (
              <div key={id} className="px-4 py-2 rounded-full border border-white/10 bg-white/[0.03] text-sm">
                <span className="text-[#ff6ba6] font-medium">{emotionLabel(id, locale)}</span>
                <span className="text-white/30 ml-2 text-xs">{id}</span>
              </div>
            ))}
          </div>
          <p className="text-white/30 text-xs mt-3">
            {t('voice.emotionHint') || 'Emotions are automatically applied when your companion speaks during chat.'}
          </p>
        </section>
      </div>
    </div>
  );
}
