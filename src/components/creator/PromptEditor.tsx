'use client';

/**
 * PromptEditor - Editable positive/negative prompt preview with highlighting
 * Allows users to see and modify prompts before generation
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';
import { Wand2, Copy, Check, RefreshCw, Sparkles } from 'lucide-react';

interface PromptEditorProps {
  positivePrompt?: string | null;
  negativePrompt?: string | null;
  basePrompt?: string | null;
  triggerWords?: string[];
  onPositiveChange?: (prompt: string) => void;
  onNegativeChange?: (prompt: string) => void;
  className?: string;
}

export function PromptEditor({
  positivePrompt,
  negativePrompt,
  basePrompt,
  triggerWords = [],
  onPositiveChange,
  onNegativeChange,
  className,
}: PromptEditorProps) {
  const { t } = useTranslation();
  const [positiveText, setPositiveText] = useState(positivePrompt || '');
  const [negativeText, setNegativeText] = useState(negativePrompt || '');
  const [copiedField, setCopiedField] = useState<'positive' | 'negative' | null>(null);
  const [isEditingPositive, setIsEditingPositive] = useState(false);
  const [isEditingNegative, setIsEditingNegative] = useState(false);

  useEffect(() => {
    setPositiveText(positivePrompt || '');
  }, [positivePrompt]);

  useEffect(() => {
    setNegativeText(negativePrompt || '');
  }, [negativePrompt]);

  const handleCopy = async (text: string, field: 'positive' | 'negative') => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const regenerateBase = () => {
    if (basePrompt) {
      setPositiveText(basePrompt);
      onPositiveChange?.(basePrompt);
      setIsEditingPositive(true);
    }
  };

  // Highlight trigger words in prompt text
  const highlightTriggers = (text: string) => {
    if (!triggerWords.length) return <>{text}</>;
    
    const parts = text.split(new RegExp(`(${triggerWords.join('|')})`, 'gi'));
    return parts.map((part, i) => 
      triggerWords.some(t => t.toLowerCase() === part.toLowerCase()) ? (
        <span key={i} className="bg-[#FF2D78]/20 px-1 rounded text-[#FF2D78] font-semibold">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      
      {/* Positive Prompt */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#FF2D78]" />
            <span className="text-xs font-bold text-white/80">{'Positive Prompt'}</span>
            <span className="text-[10px] text-white/30">({positiveText.length} chars)</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            {basePrompt && (
              <button
                type="button"
                onClick={regenerateBase}
                title={'Regenerate base prompt'}
                className="flex items-center gap-1 rounded hover:bg-white/[0.04] px-2 py-1 transition-colors"
              >
                <RefreshCw className="h-3 w-3 text-white/50" />
                <span className="text-[10px] text-white/50">{'Regen'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleCopy(positiveText, 'positive')}
              className="flex items-center gap-1 rounded hover:bg-white/[0.04] px-2 py-1 transition-colors"
              title={t('common.copy')}
            >
              {copiedField === 'positive' ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3 text-white/50" />
              )}
            </button>
          </div>
        </div>

        {/* Editor/Display */}
        <div className="relative">
          {isEditingPositive ? (
            <textarea
              value={positiveText}
              onChange={(e) => {
                setPositiveText(e.target.value);
                onPositiveChange?.(e.target.value);
              }}
              onBlur={() => setIsEditingPositive(false)}
              className="w-full min-h-[120px] resize-y bg-white/[0.02] px-4 py-3 text-xs text-white/80 outline-none focus:ring-1 focus:ring-[#FF2D78]/30"
              placeholder={'Edit your prompt here...'}
            />
          ) : (
            <div
              className="w-full min-h-[120px] px-4 py-3 text-xs leading-relaxed text-white/70"
              onClick={() => setIsEditingPositive(true)}
            >
              {highlightTriggers(positiveText)}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="flex flex-wrap items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-white/30">
          <div className="flex gap-3">
            <span>{'Words'}: {positiveText.split(/\s+/).filter(Boolean).length}</span>
            <span>{'~{count} Tokens'}: ~{Math.floor(positiveText.length / 4)}</span>
          </div>
          {!isEditingPositive && (
            <button
              type="button"
              onClick={() => setIsEditingPositive(true)}
              className="font-medium text-[#FF2D78] hover:underline"
            >
              {'Edit'} →
            </button>
          )}
        </div>
      </div>

      {/* Negative Prompt */}
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white/60">{'Negative Prompt'}</span>
            <span className="text-[10px] text-white/30">({negativeText.length} chars)</span>
          </div>
          
          <button
            type="button"
            onClick={() => handleCopy(negativeText, 'negative')}
            className="flex items-center gap-1 rounded hover:bg-white/[0.04] px-2 py-1 transition-colors"
            title={t('common.copy')}
          >
            {copiedField === 'negative' ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Copy className="h-3 w-3 text-white/50" />
            )}
          </button>
        </div>

        {/* Editor/Display */}
        <div className="relative">
          {isEditingNegative ? (
            <textarea
              value={negativeText}
              onChange={(e) => {
                setNegativeText(e.target.value);
                onNegativeChange?.(e.target.value);
              }}
              onBlur={() => setIsEditingNegative(false)}
              className="w-full min-h-[80px] resize-y bg-white/[0.02] px-4 py-3 text-xs text-white/70 outline-none focus:ring-1 focus:ring-white/20"
              placeholder={'Optional: edit negatives...'}
            />
          ) : (
            <div
              className="w-full min-h-[80px] px-4 py-3 text-xs leading-relaxed text-white/50"
              onClick={() => setIsEditingNegative(true)}
            >
              {negativeText}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-white/10 px-4 py-2 text-[10px] text-white/30">
          {!isEditingNegative && (
            <button
              type="button"
              onClick={() => setIsEditingNegative(true)}
              className="font-medium text-white/50 hover:text-white/70 hover:underline"
            >
              {'Edit'} →
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
