'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStudio } from '../StudioContext';
import { cn } from '@/lib/utils';
import { Plus, X, ChevronDown, ChevronUp, Bookmark, Tag } from 'lucide-react';
import type { NsfwIntensity } from '@/lib/comfy-console/studio-profile';

// ─── Preset categories ───────────────────────────────────────────────────────

type PresetCategory = 'framing' | 'camera' | 'scene' | 'pose' | 'lighting' | 'style';

const CATEGORIES: Array<{ id: PresetCategory; label: string; icon: string }> = [
  { id: 'style', label: '风格', icon: '🎨' },
  { id: 'framing', label: '取景', icon: '🖼' },
  { id: 'camera', label: '机位', icon: '📷' },
  { id: 'scene', label: '场景', icon: '🏞' },
  { id: 'pose', label: '动作', icon: '🤸' },
  { id: 'lighting', label: '光线', icon: '💡' },
];

// ─── Built-in presets by NSFW level ──────────────────────────────────────────

interface PresetItem {
  id: string;
  label: string;
  value: string;
  nsfw: number[];  // which NSFW levels this preset applies to (1-5)
  custom?: boolean; // user-created preset
}

const BUILTIN_PRESETS: PresetItem[] = [
  // Style
  { id: 'st-photoreal', label: '写实', value: 'photorealistic, ultra detailed, 8k, professional photography', nsfw: [1, 2, 3, 4, 5] },
  { id: 'st-anime', label: '二次元', value: 'anime style, cel shading, vibrant colors, detailed illustration', nsfw: [1, 2, 3, 4, 5] },
  { id: 'st-3d', label: '3D 渲染', value: '3D render, octane render, subsurface scattering, detailed textures', nsfw: [1, 2, 3, 4, 5] },
  { id: 'st-cinematic', label: '电影感', value: 'cinematic, dramatic lighting, film grain, shallow depth of field', nsfw: [1, 2, 3, 4, 5] },
  { id: 'st-manga', label: '漫画', value: 'manga style, black and white ink, screentone shading, dynamic lines', nsfw: [1, 2, 3, 4, 5] },
  { id: 'st-oilpaint', label: '油画', value: 'oil painting style, rich brushstrokes, classical art, warm tones', nsfw: [1, 2, 3] },
  { id: 'st-watercolor', label: '水彩', value: 'watercolor painting, soft edges, pastel colors, artistic splashes', nsfw: [1, 2, 3] },
  { id: 'st-semireal', label: '半写实', value: 'semi-realistic, digital art, blend of realism and illustration', nsfw: [1, 2, 3, 4, 5] },

  // Framing
  { id: 'f-waist', label: '半身', value: 'waist-up portrait', nsfw: [1, 2, 3, 4, 5] },
  { id: 'f-full', label: '全身', value: 'full body shot', nsfw: [1, 2, 3, 4, 5] },
  { id: 'f-closeup', label: '特写', value: 'close-up face portrait', nsfw: [1, 2, 3, 4, 5] },
  { id: 'f-cowboy', label: '牛仔镜', value: 'cowboy shot, mid-thigh up', nsfw: [1, 2, 3, 4, 5] },
  { id: 'f-wide', label: '远景', value: 'wide angle environmental portrait', nsfw: [1, 2, 3] },

  // Camera
  { id: 'c-front', label: '正面', value: 'front view, looking at camera', nsfw: [1, 2, 3, 4, 5] },
  { id: 'c-side', label: '侧面', value: 'side profile view', nsfw: [1, 2, 3, 4, 5] },
  { id: 'c-three-quarter', label: '3/4角', value: 'three-quarter view', nsfw: [1, 2, 3, 4, 5] },
  { id: 'c-high', label: '高角度', value: 'high angle shot looking down', nsfw: [1, 2, 3, 4, 5] },
  { id: 'c-low', label: '低角度', value: 'low angle shot looking up', nsfw: [1, 2, 3, 4, 5] },
  { id: 'c-behind', label: '背面', value: 'back view, looking away from camera', nsfw: [1, 2, 3] },

  // Scene
  { id: 's-studio', label: '影棚', value: 'bright studio backdrop, professional fashion photo', nsfw: [1, 2, 3, 4, 5] },
  { id: 's-bedroom', label: '卧室', value: 'cozy bedroom, warm ambient light, soft bedding', nsfw: [2, 3, 4, 5] },
  { id: 's-beach', label: '海滩', value: 'tropical beach, golden hour sunlight, ocean breeze', nsfw: [1, 2, 3, 4] },
  { id: 's-cafe', label: '咖啡厅', value: 'modern cafe interior, warm window light, bokeh background', nsfw: [1, 2, 3] },
  { id: 's-garden', label: '花园', value: 'lush garden, dappled sunlight through leaves', nsfw: [1, 2, 3] },
  { id: 's-night', label: '夜景', value: 'city night, neon lights in background, moody atmosphere', nsfw: [1, 2, 3, 4] },
  { id: 's-bath', label: '浴室', value: 'steam-filled bathroom, wet surfaces, soft diffused light', nsfw: [3, 4, 5] },
  { id: 's-hotel', label: '酒店', value: 'luxury hotel room, dim ambient lighting, plush fabrics', nsfw: [3, 4, 5] },

  // Pose
  { id: 'p-relaxed', label: '放松站', value: 'relaxed standing pose, weight on one leg', nsfw: [1, 2, 3, 4, 5] },
  { id: 'p-sitting', label: '坐姿', value: 'seated pose, elegant posture', nsfw: [1, 2, 3, 4, 5] },
  { id: 'p-lean', label: '倚靠', value: 'leaning against wall, casual pose', nsfw: [1, 2, 3, 4] },
  { id: 'p-walk', label: '行走', value: 'walking mid-stride, dynamic motion', nsfw: [1, 2, 3] },
  { id: 'p-lying', label: '躺姿', value: 'lying down, relaxed body, natural pose', nsfw: [2, 3, 4, 5] },
  { id: 'p-kneel', label: '跪姿', value: 'kneeling pose, looking up at camera', nsfw: [3, 4, 5] },
  { id: 'p-bend', label: '弯腰', value: 'bending over, three-quarter angle', nsfw: [4, 5] },

  // Lighting
  { id: 'l-soft', label: '柔光', value: 'soft diffused lighting, gentle shadows', nsfw: [1, 2, 3, 4, 5] },
  { id: 'l-golden', label: '黄金光', value: 'golden hour warm sunlight, rim light on hair', nsfw: [1, 2, 3, 4, 5] },
  { id: 'l-dramatic', label: '戏剧光', value: 'dramatic side lighting, deep shadows, chiaroscuro', nsfw: [1, 2, 3, 4, 5] },
  { id: 'l-neon', label: '霓虹', value: 'neon colored lighting, cyan and magenta glow', nsfw: [2, 3, 4, 5] },
  { id: 'l-candle', label: '烛光', value: 'warm candlelight, intimate atmosphere', nsfw: [2, 3, 4, 5] },
  { id: 'l-window', label: '窗光', value: 'natural window light, soft directional illumination', nsfw: [1, 2, 3, 4, 5] },
  { id: 'l-rembrandt', label: '伦勃朗', value: 'Rembrandt lighting, triangle highlight on cheek', nsfw: [1, 2, 3, 4, 5] },
];

// ─── Custom presets storage ──────────────────────────────────────────────────

const STORAGE_KEY = 'studio-custom-presets';

function loadCustomPresets(): PresetItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PresetItem[];
  } catch { return []; }
}

function saveCustomPresets(presets: PresetItem[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PromptPresets() {
  const { state, dispatch } = useStudio();
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('framing');
  const [expanded, setExpanded] = useState(true);
  const [customPresets, setCustomPresets] = useState<PresetItem[]>([]);
  const [addingMode, setAddingMode] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newNsfw, setNewNsfw] = useState<number[]>([1, 2, 3, 4, 5]);
  // Track applied preset per category so same-category selects REPLACE rather than append
  const [appliedByCategory, setAppliedByCategory] = useState<Record<string, string>>({});

  useEffect(() => {
    setCustomPresets(loadCustomPresets());
  }, []);

  const currentNsfw = state.nsfwIntensity;

  const allPresets = useMemo(() => {
    return [...BUILTIN_PRESETS, ...customPresets];
  }, [customPresets]);

  const filteredPresets = useMemo(() => {
    const categoryMap: Record<PresetCategory, string[]> = {
      style: ['st-'],
      framing: ['f-'],
      camera: ['c-'],
      scene: ['s-'],
      pose: ['p-'],
      lighting: ['l-'],
    };
    const prefixes = categoryMap[activeCategory];
    return allPresets.filter((p) => {
      const matchCategory = prefixes.some((prefix) => p.id.startsWith(prefix)) || p.custom;
      const matchNsfw = p.nsfw.includes(currentNsfw);
      return matchCategory && matchNsfw;
    });
  }, [allPresets, activeCategory, currentNsfw]);

  // Determine which category a preset belongs to
  const getPresetCategory = (preset: PresetItem): string => {
    if (preset.id.startsWith('st-')) return 'style';
    if (preset.id.startsWith('f-')) return 'framing';
    if (preset.id.startsWith('c-')) return 'camera';
    if (preset.id.startsWith('s-')) return 'scene';
    if (preset.id.startsWith('p-')) return 'pose';
    if (preset.id.startsWith('l-')) return 'lighting';
    return 'custom';
  };

  const applyPreset = useCallback((preset: PresetItem) => {
    const cat = getPresetCategory(preset);
    const current = state.prompt.trim();
    const oldValue = appliedByCategory[cat];

    let newPrompt: string;
    if (oldValue && current.includes(oldValue)) {
      // Replace: remove old value from same category, then append new
      newPrompt = current
        .replace(new RegExp(',?\\s*' + oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '')
        .replace(new RegExp(oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*,?', 'i'), '')
        .trim()
        .replace(/,\s*$/, '');
    } else {
      newPrompt = current;
    }

    // Append new value
    const separator = newPrompt && !newPrompt.endsWith(', ') && !newPrompt.endsWith(',') ? ', ' : newPrompt ? ' ' : '';
    newPrompt = newPrompt + separator + preset.value;

    dispatch({ type: 'SET_PROMPT', text: newPrompt });
    setAppliedByCategory((prev) => ({ ...prev, [cat]: preset.value }));
  }, [state.prompt, dispatch, appliedByCategory]);

  // Check if a preset is currently the active one in its category
  const isActive = (preset: PresetItem): boolean => {
    const cat = getPresetCategory(preset);
    return appliedByCategory[cat] === preset.value;
  };

  const deletePreset = useCallback((preset: PresetItem) => {
    if (!preset.custom) return; // can only delete custom presets
    const updated = customPresets.filter((p) => p.id !== preset.id);
    setCustomPresets(updated);
    saveCustomPresets(updated);
  }, [customPresets]);

  const addPreset = useCallback(() => {
    if (!newLabel.trim() || !newValue.trim()) return;
    const id = `${activeCategory[0]}-custom-${Date.now()}`;
    const preset: PresetItem = {
      id,
      label: newLabel.trim(),
      value: newValue.trim(),
      nsfw: newNsfw,
      custom: true,
    };
    const updated = [...customPresets, preset];
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setNewLabel('');
    setNewValue('');
    setNewNsfw([1, 2, 3, 4, 5]);
    setAddingMode(false);
  }, [newLabel, newValue, newNsfw, activeCategory, customPresets]);

  const toggleNsfwLevel = (level: number) => {
    setNewNsfw((prev) =>
      prev.includes(level) ? prev.filter((n) => n !== level) : [...prev, level],
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Bookmark className="h-3 w-3 text-violet-400" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            提示词预设
          </span>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-600" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-600" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Category tabs */}
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setAddingMode(false); }}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-medium transition',
                  activeCategory === cat.id
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-slate-500 hover:bg-white/[0.06] hover:text-slate-300',
                )}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
            {/* Add button (advanced mode only) */}
            {state.advancedMode && (
              <button
                onClick={() => setAddingMode(!addingMode)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-medium transition',
                  addingMode
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-600 hover:bg-white/[0.06] hover:text-slate-400',
                )}
              >
                <Plus className="mr-0.5 inline h-3 w-3" /> 自定义
              </button>
            )}
          </div>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-1">
            {filteredPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className={cn(
                  'group relative rounded-md border px-2 py-1 text-[10px] transition',
                  isActive(preset)
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200 font-semibold'
                    : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-white',
                )}
              >
                {preset.label}
                {/* Delete button for custom presets */}
                {preset.custom && state.advancedMode && (
                  <span
                    onClick={(e) => { e.stopPropagation(); deletePreset(preset); }}
                    className="ml-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-red-500/20 text-[8px] text-red-400 opacity-0 transition group-hover:opacity-100"
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
            {filteredPresets.length === 0 && (
              <span className="text-[10px] text-slate-600">
                当前 NSFW {currentNsfw} 无可用预设
              </span>
            )}
          </div>

          {/* Add custom preset form (advanced mode) */}
          {addingMode && state.advancedMode && (
            <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5">
              <div className="flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-emerald-300">新增预设</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="显示名称"
                  className="h-7 rounded-md border border-white/10 bg-[#0d0d15] px-2 text-[11px] text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="英文提示词"
                  className="h-7 rounded-md border border-white/10 bg-[#0d0d15] px-2 text-[11px] text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>
              {/* NSFW level selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-slate-500">适用等级：</span>
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => toggleNsfwLevel(level)}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[9px] font-medium transition',
                      newNsfw.includes(level)
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-white/[0.04] text-slate-600',
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={addPreset}
                  disabled={!newLabel.trim() || !newValue.trim()}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-[10px] font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  添加
                </button>
                <button
                  onClick={() => { setAddingMode(false); setNewLabel(''); setNewValue(''); }}
                  className="rounded-md px-3 py-1 text-[10px] text-slate-400 hover:text-white"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
