'use client';

import { useStudio } from '../StudioContext';
import { PromptComposer } from './PromptComposer';
import { AspectRatioBar } from './AspectRatioBar';
import { ParameterDrawer } from './ParameterDrawer';
import { QuickTransformBar } from '../tasks/QuickTransformBar';
import { ReferenceUploader } from './ReferenceUploader';
import { LoraStack } from '../lora/LoraStack';
import { LoraSelector } from '../lora/LoraSelector';
import { Img2ImgInput } from '../modes/Img2ImgInput';
import { Img2VideoInput } from '../modes/Img2VideoInput';
import { AssetCarousel } from '../companion/AssetCarousel';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function InputPanel() {
  const { state, generate } = useStudio();
  const [showLoraSelector, setShowLoraSelector] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {/* Companion asset carousel (置顶：形象下方，实时跟随新图) */}
      {state.companionId && <AssetCarousel />}

      {/* Reference image uploader (img2img / img2video) */}
      {(state.genMode === 'img2img' || state.genMode === 'img2video') && (
        <ReferenceUploader />
      )}

      {/* Quick transform bar (img2img only) */}
      {state.genMode === 'img2img' && <QuickTransformBar />}

      {/* img2img controls */}
      {state.genMode === 'img2img' && <Img2ImgInput />}

      {/* img2video controls */}
      {state.genMode === 'img2video' && <Img2VideoInput />}

      {/* Prompt composer */}
      <PromptComposer />

      {/* Model / asset role / IP-Adapter / enhancers / advanced params */}
      <ParameterDrawer />

      {/* LoRA stack（模型选择下方，按当前模型族过滤） */}
      <LoraStack />

      {/* LoRA selector toggle */}
      <button
        onClick={() => setShowLoraSelector(!showLoraSelector)}
        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400 hover:bg-white/[0.06] transition"
      >
        <span>LoRA 插件 ({state.selectedLoras.length})</span>
        {showLoraSelector ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {showLoraSelector && <LoraSelector />}

      {/* Aspect ratio */}
      <AspectRatioBar />

      {/* Generate button */}
      <Button
        onClick={() => void generate()}
        disabled={state.generating}
        className={cn(
          'w-full h-11 text-sm font-bold rounded-xl shadow-lg transition-all',
          'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500',
          'shadow-violet-900/40 hover:shadow-violet-800/60',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {state.generating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {state.generationStage === 'queued' ? 'GPU 排队中…' : state.generationStage === 'finalizing' ? '保存中…' : '提交中…'}
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            生成
          </>
        )}
      </Button>
    </div>
  );
}
