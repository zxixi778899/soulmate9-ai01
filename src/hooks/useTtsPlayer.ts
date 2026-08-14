import { useState, useRef, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';

interface TtsState {
  playing: boolean;
  loading: boolean;
  error: string | null;
  activeMsgId: string | null;
}

export function useTtsPlayer() {
  const [state, setState] = useState<TtsState>({
    playing: false,
    loading: false,
    error: null,
    activeMsgId: null,
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setState({ playing: false, loading: false, error: null, activeMsgId: null });
  }, []);

  const speak = useCallback(async (text: string, girlfriendId: string, msgId: string) => {
    // If already playing this message, stop it
    if (state.activeMsgId === msgId && state.playing) {
      stop();
      return;
    }

    // Stop any current playback
    stop();

    setState({ playing: false, loading: true, error: null, activeMsgId: msgId });

    try {
      // authedFetch injects the x-session header required by getAuthUser —
      // a plain fetch would be rejected with 401.
      const res = await authedFetch('/api/ai/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 300), girlfriend_id: girlfriendId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'TTS failed');
      }

      const data = await res.json();
      if (!data.audio_url) throw new Error('No audio URL returned');

      const audio = new Audio(data.audio_url);
      audioRef.current = audio;

      audio.onended = () => {
        setState({ playing: false, loading: false, error: null, activeMsgId: null });
        audioRef.current = null;
      };

      audio.onerror = () => {
        setState({ playing: false, loading: false, error: 'Playback error', activeMsgId: null });
        audioRef.current = null;
      };

      await audio.play();
      setState({ playing: true, loading: false, error: null, activeMsgId: msgId });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'TTS failed';
      setState({ playing: false, loading: false, error: message || 'TTS failed', activeMsgId: null });
    }
  }, [state.activeMsgId, state.playing, stop]);

  return { ...state, speak, stop };
}
