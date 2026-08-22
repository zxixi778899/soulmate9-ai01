'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { Loader2, Zap, RefreshCw } from 'lucide-react';
import { OptimizedImg } from '@/components/OptimizedImg';
import { GamePrimaryButton } from '@/components/game/GameShell';
import { useCreationStore } from './useCreationStore';

/**
 * LivePreviewPanel - 实时预览面板
 * 
 * Features:
 * - Turbo mode quick preview (8 steps, 640x960)
 * - Debounced auto-preview on param change
 * - Manual trigger button
 * - Progress indication
 */

interface PreviewState {
  image: string | null;
  isGenerating: boolean;
  error: string | null;
  lastUpdated: number;
}

export const LivePreviewPanel = () => {
  const { formData, previewMode, enablePreview, disablePreview, lastPreviewTime } = useCreationStore();
  const [previewState, setPreviewState] = useState<PreviewState>({
    image: null,
    isGenerating: false,
    error: null,
    lastUpdated: 0,
  });
  
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Auto-trigger preview when params change (with debounce)
  useEffect(() => {
    if (previewMode === 'disabled') return;
    
    const now = Date.now();
    const timeSinceLastPreview = now - lastPreviewTime;
    
    // Only allow preview every 2s minimum
    if (timeSinceLastPreview < 2000) return;

    // Debounce: wait 800ms after param stabilization
    if (debounceTimer) clearTimeout(debounceTimer);
    
    const timer = setTimeout(async () => {
      await generateTurboPreview();
    }, 800);
    
    setDebounceTimer(timer);
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [formData, previewMode, lastPreviewTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const generateTurboPreview = useCallback(async () => {
    if (previewMode === 'disabled') {
      enablePreview('turbo');
    }

    setPreviewState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      // Prepare request body for turbo generation
      const requestBody = {
        name: formData.name || 'Companion',
        visual_style: formData.visualStyle,
        ethnicity: formData.ethnicity,
        gender: formData.gender,
        face_shape: formData.faceShape,
        hair_style: formData.hairStyle,
        hair_color: formData.hairColor,
        eye_color: formData.eyeColor,
        body_type: formData.bodyType,
        fashion_style: formData.fashionStyle,
        appearance_prompt: formData.appearancePrompt,
        personality: formData.selectedTags.join(', '),
        nsfw_level: formData.nsfwLevel,
        // Turbo-specific settings
        turbo_mode: true,
        count: 1,
      };

      const response = await authedFetch('/api/girlfriends/generate-portrait-turbo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok || !data.imageUrl) {
        throw new Error(data.error || 'Preview generation failed');
      }

      setPreviewState({
        image: data.imageUrl,
        isGenerating: false,
        error: null,
        lastUpdated: Date.now(),
      });
      
      // Update preview timestamp
      enablePreview('turbo');

    } catch (error) {
      logger.warn('[LivePreview] Generation failed', { error });
      setPreviewState(prev => ({
        ...prev,
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Generation failed',
      }));
    }
  }, [formData, previewMode, enablePreview]);

  const handleManualTrigger = () => {
    if (previewState.isGenerating) return;
    generateTurboPreview();
  };

  const handleReset = () => {
    setPreviewState({
      image: null,
      isGenerating: false,
      error: null,
      lastUpdated: 0,
    });
    disablePreview();
  };

  // Don't render if disabled or no image yet
  if (previewMode === 'disabled' && !previewState.image) {
    return (
      <div className="sticky top-4 hidden lg:block">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-6 text-center">
          <Zap className="h-8 w-8 mx-auto mb-3 text-white/20" />
          <h3 className="text-sm font-semibold text-white/50 mb-2">
            Live Preview
          </h3>
          <p className="text-xs text-white/30 mb-4">
            Adjust parameters and see results in real-time
          </p>
          <GamePrimaryButton onClick={() => enablePreview('turbo')} className="w-full">
            Enable Quick Preview
          </GamePrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-4 space-y-3">
      {/* Preview Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent shadow-2xl">
        {/* Header Badge */}
        <div className="flex items-center justify-between px-3 py-2 bg-black/40 backdrop-blur-sm border-b border-white/06">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-[#FF2D78]" />
            <span className="text-[10px] font-medium text-white/70">
              TURBO PREVIEW
            </span>
          </div>
          {previewState.lastUpdated > 0 && (
            <span className="text-[9px] text-white/30">
              {Math.round((Date.now() - previewState.lastUpdated) / 1000)}s ago
            </span>
          )}
        </div>

        {/* Image Area */}
        <div className="relative aspect-[3/4] bg-black/50">
          {previewState.isGenerating ? (
            <>
              {/* Shimmer Effect */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-full w-full overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
                    animate={{ x: ['-100%', '300%'] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              </div>
              
              {/* Loading Icon */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
                <span className="text-xs text-white/40">
                  Generating preview...
                </span>
              </div>
            </>
          ) : previewState.image ? (
            <OptimizedImg
              src={previewState.image}
              size="card"
              alt="Live preview"
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/20">
              <Zap className="h-12 w-12" />
            </div>
          )}

          {/* Error Overlay */}
          {previewState.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 text-center">
              <p className="text-xs text-red-300">{previewState.error}</p>
            </div>
          )}

          {/* Turbo Badge */}
          {previewState.image && (
            <div className="absolute right-2 top-2 rounded-full bg-[#FF2D78]/80 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
              8 STEPS
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 p-3 border-t border-white/06">
          <GamePrimaryButton
            onClick={handleManualTrigger}
            disabled={previewState.isGenerating}
            className="flex-1"
          >
            {previewState.isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className={`h-3.5 w-3.5 ${previewState.image ? '' : 'hidden'}`} />
            )}
            {previewState.isGenerating ? 'Generating' : previewState.image ? 'Regenerate' : 'Generate'}
          </GamePrimaryButton>
          
          {previewState.image && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3 rounded-xl border border-white/10 bg-white/[0.035] text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-all text-xs"
              title="Disable preview"
            >
              Off
            </button>
          )}
        </div>
      </div>

      {/* Usage Hint */}
      {previewState.image && (
        <div className="text-center">
          <p className="text-[10px] text-white/30">
            💡 This is a low-cost preview (15% of final cost). Click{" "}
            <span className="text-white/60">Finish</span>{" "}
            to generate the high-quality version.
          </p>
        </div>
      )}
    </div>
  );
};
