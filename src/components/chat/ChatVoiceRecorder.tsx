'use client';

/**
 * Voice-to-text input (Whisper STT) for the chat composer.
 *
 * `useVoiceTranscription` is the headless core: records WebM/Opus audio via
 * MediaRecorder, sends it to POST /api/audio/transcribe and returns the
 * transcript. `ChatVoiceRecorder` is a ready-made icon button wrapper.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';

export interface VoiceTranscriptionState {
  isRecording: boolean;
  isTranscribing: boolean;
  /** Start or stop recording; on stop the transcript is submitted. */
  toggle: () => void;
}

/**
 * Headless voice-to-text hook.
 * @param onTranscribe called with the transcript text on success
 * @param onError called with a user-facing message on failure
 */
export function useVoiceTranscription(
  onTranscribe: (text: string) => void,
  onError?: (message: string) => void,
): VoiceTranscriptionState {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => cleanupStream, [cleanupStream]);

  const startRecording = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError?.(t('voiceInput.failed'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined,
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      cleanupStream();
      onError?.(t('voiceInput.failed'));
    }
  }, [cleanupStream, onError, t]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      recorder.stop();
    });

    setIsRecording(false);
    const audioBlob = await stopped;
    cleanupStream();

    if (audioBlob.size === 0) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `recording-${Date.now()}.webm`);

      const response = await authedFetch('/api/audio/transcribe', {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as {
        success?: boolean;
        transcript?: string;
        error?: string;
      };

      if (!response.ok || !data.transcript) {
        onError?.(data.error || t('voiceInput.failed'));
        return;
      }
      onTranscribe(data.transcript);
    } catch {
      onError?.(t('voiceInput.failed'));
    } finally {
      setIsTranscribing(false);
    }
  }, [cleanupStream, onError, onTranscribe, t]);

  const toggle = useCallback(() => {
    if (isTranscribing) return;
    if (isRecording) {
      void stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, isTranscribing, startRecording, stopRecording]);

  return { isRecording, isTranscribing, toggle };
}

interface ChatVoiceRecorderProps {
  /** Called with the transcribed text on success. */
  onTranscribe: (text: string) => void;
  /** Optional error callback (receives a user-facing message). */
  onError?: (message: string) => void;
  className?: string;
}

/**
 * Standalone voice-to-text icon button (uses the shadcn Button style).
 * For the chat composer's custom ToolButton grid, use useVoiceTranscription
 * directly instead.
 */
export function ChatVoiceRecorder({ onTranscribe, onError, className }: ChatVoiceRecorderProps) {
  const { t } = useTranslation();
  const { isRecording, isTranscribing, toggle } = useVoiceTranscription(onTranscribe, onError);

  const label = isTranscribing
    ? t('voiceInput.transcribing')
    : isRecording
      ? t('voiceInput.recording')
      : t('voiceInput.start');

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={isTranscribing}
      aria-label={label}
      title={label}
      className={className}
    >
      {isTranscribing ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : isRecording ? (
        <Square className="h-5 w-5 text-rose-500" fill="currentColor" />
      ) : (
        <Mic className="h-5 w-5" />
      )}
    </Button>
  );
}
