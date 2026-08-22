'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/lib/i18n/types';
import { useTranslation } from '@/lib/i18n/context';

/**
 * VisualParamSlider - 可视化参数滑块组件
 * 
 * Features:
 * - Dual mode: Slider / Preset buttons
 * - Smooth animations with Framer Motion
 * - Real-time value display
 * - Auto-debounce preview triggers
 */

export interface ParamOption {
  value: string | number;
  label_en: string;
  label_zh?: string;
  hint?: string;
}

export interface ParamGroupConfig {
  id: string;
  label: string | TranslationKey;
  category: string;
  options: ParamOption[];
  initialMode?: 'slider' | 'presets';
  min?: number;
  max?: number;
  step?: number;
  presetValues?: (string | number)[]; // Subset of options for quick presets
}

interface VisualParamSliderProps {
  config: ParamGroupConfig;
  currentValue: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  className?: string;
}

export const VisualParamSlider = ({
  config,
  currentValue,
  onChange,
  disabled = false,
  className,
}: VisualParamSliderProps) => {
  const { t, locale } = useTranslation();
  const [mode, setMode] = useState<'slider' | 'presets'>(() => 
    config.initialMode || 'presets'
  );

  const getLabel = (option: ParamOption): string => {
    if (locale === 'zh' && option.label_zh) return option.label_zh;
    return typeof config.label === 'string' ? config.label : t(config.label as TranslationKey);
  };

  const isSelected = (value: string | number): boolean => {
    return String(currentValue) === String(value);
  };

  return (
    <div 
      className={cn(
        'relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.02]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/06">
        <h3 className="text-sm font-semibold text-white/90 tracking-wide">
          {getLabel({ value: '', label_en: '', label_zh: '' })}
        </h3>
        
        {/* Mode Toggle */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode('slider')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all',
              mode === 'slider'
                ? 'bg-[#FF2D78]/20 text-[#FF2D78] border border-[#FF2D78]/30'
                : 'text-white/40 hover:text-white/60'
            )}
            disabled={disabled}
          >
            Slider
          </button>
          <button
            type="button"
            onClick={() => setMode('presets')}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all',
              mode === 'presets'
                ? 'bg-[#FF2D78]/20 text-[#FF2D78] border border-[#FF2D78]/30'
                : 'text-white/40 hover:text-white/60'
            )}
            disabled={disabled}
          >
            Presets
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {mode === 'slider' ? (
          <SliderView
            config={config}
            currentValue={currentValue}
            onChange={onChange}
            disabled={disabled}
          />
        ) : (
          <PresetsView
            config={config}
            currentValue={currentValue}
            onChange={onChange}
            disabled={disabled}
            isSelected={isSelected}
          />
        )}
      </div>
    </div>
  );
};

/**
 * Slider View - 平滑过渡的滑块模式
 */
const SliderView = ({
  config,
  currentValue,
  onChange: _onChange,
  disabled: _disabled,
}: {
  config: ParamGroupConfig;
  currentValue: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
}) => {
  void _onChange; void _disabled; // Reserved for future interactivity
  const selectedIndex = config.options.findIndex(
    opt => String(opt.value) === String(currentValue)
  );

  const percentage = selectedIndex >= 0 
    ? (selectedIndex / (config.options.length - 1)) * 100 
    : 0;

  return (
    <div className="space-y-3">
      {/* Slider Track */}
      <div className="relative h-3 bg-white/[0.06] rounded-full overflow-hidden">
        {/* Selected Progress */}
        <motion.div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6]"
          initial={{ width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
        
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.4)]"
          style={{ left: `calc(${percentage}% - 10px)` }}
        >
          <div className="absolute inset-0 animate-ping rounded-full bg-white/30" />
        </div>
      </div>

      {/* Option Labels */}
      <div className="flex justify-between text-[10px] text-white/30">
        {config.options.map((opt, idx) => {
          if (config.options.length <= 4 || idx % Math.ceil(config.options.length / 4) !== 0) {
            return (
              <span key={idx} className="truncate max-w-[25%]">
                {opt.label_en}
              </span>
            );
          }
          return null;
        })}
      </div>

      {/* Current Value Badge */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-white/50">Current:</span>
        <motion.span
          key={currentValue}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-semibold text-[#FF2D78]"
        >
          {config.options.find(opt => String(opt.value) === String(currentValue))?.label_en}
        </motion.span>
      </div>
    </div>
  );
};

/**
 * Presets View - 预设按钮网格布局
 */
const PresetsView = ({
  config,
  currentValue: _currentValue,
  onChange,
  disabled,
  isSelected,
}: {
  config: ParamGroupConfig;
  currentValue: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  isSelected: (value: string | number) => boolean;
}) => {
  void _currentValue; // Used via isSelected callback
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {config.options.map((option) => (
        <motion.button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={cn(
            'relative p-3 rounded-xl border text-left transition-all duration-200 touch-manipulation',
            isSelected(option.value)
              ? 'border-[#FF2D78]/70 bg-[#FF2D78]/10 shadow-[0_0_18px_rgba(255,45,120,0.2)] scale-[1.02]'
              : 'border-white/[0.09] bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
          )}
          whileHover={!disabled ? { scale: 1.02 } : {}}
          whileTap={!disabled ? { scale: 0.98 } : {}}
        >
          {/* Check Indicator */}
          {isSelected(option.value) && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#FF2D78] shadow-[0_0_10px_rgba(255,45,120,0.5)]"
            >
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
          )}

          {/* Option Label */}
          <div className="text-xs font-semibold text-white/90">
            {option.label_en}
          </div>
          
          {/* Optional Hint */}
          {option.hint && (
            <div className="mt-0.5 text-[10px] text-white/35 line-clamp-1">
              {option.hint}
            </div>
          )}
        </motion.button>
      ))}
    </div>
  );
};
