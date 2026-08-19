'use client';

import { useState, useMemo, useEffect } from 'react';
import { useStudio } from '../StudioContext';
import { cn } from '@/lib/utils';
import { Search, Plus, Minus, AlertTriangle } from 'lucide-react';
import type { Any } from '../StudioWorkbench.types';

const LORA_CATEGORIES = ['全部', '风格', '细节', '体型', '动作', '服装'] as const;
type LoraCategory = typeof LORA_CATEGORIES[number];

const FAMILY_LABELS: Record<string, { label: string; color: string }> = {
  flux: { label: 'FLUX', color: 'text-violet-400' },
  pony: { label: 'Pony', color: 'text-pink-400' },
  illustrious: { label: 'Illustrious', color: 'text-cyan-400' },
};

export function LoraSelector() {
  const { state, dispatch, generationRoute } = useStudio();
  const [filter, setFilter] = useState('');
  const [activeCategory, setActiveCategory] = useState<LoraCategory>('全部');
  const [activeFamily, setActiveFamily] = useState<string>('全部');

  const allLoras = useMemo<Any[]>(() => state.config?.loras || [], [state.config?.loras]);

  // 模型族切换（含手动模型覆盖）时同步 LoRA 库筛选，避免跨族误选
  useEffect(() => {
    setActiveFamily(generationRoute.modelFamily);
  }, [generationRoute.modelFamily]);

  // Extract unique families from lora list
  const families = useMemo(() => {
    const set = new Set<string>();
    allLoras.forEach((l) => {
      const fam = String(l.family || '').toLowerCase();
      if (fam) set.add(fam);
    });
    return Array.from(set);
  }, [allLoras]);

  // Get the dominant family among currently selected LoRAs
  const selectedFamilies = useMemo(() => {
    const fams = new Set<string>();
    state.selectedLoras.forEach((s) => {
      const lora = allLoras.find((l) => String(l.id || l.name) === s.id);
      if (lora) fams.add(String(lora.family || '').toLowerCase());
    });
    return fams;
  }, [state.selectedLoras, allLoras]);

  const filteredLoras = useMemo(() => {
    let list = allLoras;
    // Filter by model family
    if (activeFamily !== '全部') {
      list = list.filter((l) => String(l.family || '').toLowerCase() === activeFamily.toLowerCase());
    }
    // Filter by category
    if (activeCategory !== '全部') {
      const catMap: Record<string, string> = {
        '风格': 'style', '细节': 'detail', '体型': 'body', '动作': 'action', '服装': 'outfit',
      };
      const catId = catMap[activeCategory] || activeCategory.toLowerCase();
      list = list.filter((l) => {
        const category = String(l.category || '').toLowerCase();
        return category === catId;
      });
    }
    // Filter by search
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      list = list.filter((l) => {
        const name = String(l.name || l.label || l.id || '').toLowerCase();
        const usage = String(l.usage || '').toLowerCase();
        const triggerWords: string[] = Array.isArray(l.trigger_words) ? l.trigger_words.map(String) : [];
        return name.includes(q) || usage.includes(q) || triggerWords.some((w) => w.toLowerCase().includes(q));
      });
    }
    return list;
  }, [allLoras, activeFamily, activeCategory, filter]);

  const isSelected = (id: string) => state.selectedLoras.some((s) => s.id === id);

  const toggleLora = (lora: Any) => {
    const id = String(lora.id || lora.name);
    if (isSelected(id)) {
      dispatch({ type: 'REMOVE_LORA', id });
    } else if (state.selectedLoras.length < 4) {
      dispatch({
        type: 'ADD_LORA',
        lora: { id, strength: Number(lora.default_strength || 0.8) },
      });
    }
  };

  // Check if selecting this LoRA would cause cross-family mixing
  const wouldMixFamilies = (lora: Any): boolean => {
    const loraFamily = String(lora.family || '').toLowerCase();
    return selectedFamilies.size > 0 && !selectedFamilies.has(loraFamily);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          LoRA 库
        </h4>
        <span className="text-[10px] text-slate-600">
          {state.selectedLoras.length}/4 已激活
        </span>
      </div>

      {/* Cross-family warning */}
      {selectedFamilies.size > 1 && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
          <span className="text-[9px] text-amber-300">
            已选 LoRA 来自不同模型族，可能产生不兼容效果
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative mt-2">
        <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索 LoRA 名称或用途…"
          className="h-7 w-full rounded-lg border border-white/10 bg-[#0d0d15] pl-7 pr-2 text-xs text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
        />
      </div>

      {/* Model family tabs */}
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          onClick={() => setActiveFamily('全部')}
          className={cn(
            'rounded-md px-2 py-0.5 text-[10px] font-medium transition',
            activeFamily === '全部'
              ? 'bg-white/10 text-white'
              : 'text-slate-500 hover:bg-white/[0.06] hover:text-slate-300',
          )}
        >
          全部模型
        </button>
        {families.map((fam) => {
          const info = FAMILY_LABELS[fam] || { label: fam, color: 'text-slate-400' };
          return (
            <button
              key={fam}
              onClick={() => setActiveFamily(fam)}
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-medium transition',
                activeFamily === fam
                  ? 'bg-white/10 text-white'
                  : `text-slate-500 hover:bg-white/[0.06] hover:text-slate-300`,
              )}
            >
              <span className={activeFamily === fam ? info.color : ''}>{info.label}</span>
              <span className="ml-1 text-[8px] text-slate-600">
                ({allLoras.filter((l) => String(l.family || '').toLowerCase() === fam).length})
              </span>
            </button>
          );
        })}
      </div>

      {/* Category tabs */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {LORA_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-medium transition',
              activeCategory === cat
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-slate-500 hover:bg-white/[0.06] hover:text-slate-300',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* LoRA grid */}
      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
        {filteredLoras.length === 0 ? (
          <p className="py-4 text-center text-[10px] text-slate-600">
            {allLoras.length === 0 ? '暂无已安装 LoRA' : '无匹配结果'}
          </p>
        ) : (
          filteredLoras.map((lora) => {
            const id = String(lora.id || lora.name);
            const name = String(lora.label || lora.name || lora.id);
            const usage = String(lora.usage || '');
            const family = String(lora.family || '').toLowerCase();
            const familyInfo = FAMILY_LABELS[family];
            const selected = isSelected(id);
            const mixWarning = !selected && wouldMixFamilies(lora);
            return (
              <button
                key={id}
                onClick={() => toggleLora(lora)}
                disabled={!selected && state.selectedLoras.length >= 4}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition',
                  selected
                    ? 'border-violet-500/40 bg-violet-500/10'
                    : mixWarning
                      ? 'border-amber-500/20 bg-amber-500/[0.03] hover:border-amber-500/30'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]',
                  !selected && state.selectedLoras.length >= 4 && 'opacity-40 cursor-not-allowed',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[11px] font-medium text-white">{name}</p>
                    {familyInfo && (
                      <span className={cn('shrink-0 text-[8px] font-medium', familyInfo.color)}>
                        {familyInfo.label}
                      </span>
                    )}
                    {mixWarning && (
                      <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-400" />
                    )}
                  </div>
                  {usage && (
                    <p className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-slate-500">
                      {usage}
                    </p>
                  )}
                  {Array.isArray(lora.trigger_words) && lora.trigger_words.length > 0 && (
                    <p className="mt-0.5 truncate text-[8px] text-slate-600">
                      触发词: {lora.trigger_words.slice(0, 4).map(String).join(', ')}
                    </p>
                  )}
                </div>
                {selected ? (
                  <Minus className="mt-0.5 h-3 w-3 shrink-0 text-violet-400" />
                ) : (
                  <Plus className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
