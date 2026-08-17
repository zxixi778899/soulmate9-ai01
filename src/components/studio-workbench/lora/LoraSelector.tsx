'use client';

import { useState, useMemo } from 'react';
import { useStudio } from '../StudioContext';
import { cn } from '@/lib/utils';
import { Search, Plus, Minus } from 'lucide-react';
import type { Any } from '../StudioWorkbench.types';

const LORA_CATEGORIES = ['全部', '身材', '服装', '动作', '细节', '风格'] as const;
type LoraCategory = typeof LORA_CATEGORIES[number];

export function LoraSelector() {
  const { state, dispatch } = useStudio();
  const [filter, setFilter] = useState('');
  const [activeCategory, setActiveCategory] = useState<LoraCategory>('全部');

  const allLoras: Any[] = state.config?.loras || [];

  const filteredLoras = useMemo(() => {
    let list = allLoras;
    if (activeCategory !== '全部') {
      list = list.filter((l) => {
        const tags: string[] = Array.isArray(l.tags) ? l.tags.map(String) : [];
        const category = String(l.category || '').toLowerCase();
        return category === activeCategory.toLowerCase() || tags.some((t) => t.includes(activeCategory));
      });
    }
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      list = list.filter((l) => {
        const name = String(l.name || l.id || '').toLowerCase();
        const triggerWords: string[] = Array.isArray(l.trigger_words) ? l.trigger_words.map(String) : [];
        return name.includes(q) || triggerWords.some((w) => w.toLowerCase().includes(q));
      });
    }
    return list;
  }, [allLoras, activeCategory, filter]);

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

      {/* Search */}
      <div className="relative mt-2">
        <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索 LoRA 名称或触发词…"
          className="h-7 w-full rounded-lg border border-white/10 bg-[#0d0d15] pl-7 pr-2 text-xs text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
        />
      </div>

      {/* Category tabs */}
      <div className="mt-2 flex flex-wrap gap-1">
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
            const name = String(lora.name || lora.id);
            const selected = isSelected(id);
            return (
              <button
                key={id}
                onClick={() => toggleLora(lora)}
                disabled={!selected && state.selectedLoras.length >= 4}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition',
                  selected
                    ? 'border-violet-500/40 bg-violet-500/10'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]',
                  !selected && state.selectedLoras.length >= 4 && 'opacity-40 cursor-not-allowed',
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[11px] font-medium text-white">{name}</p>
                  {Array.isArray(lora.trigger_words) && lora.trigger_words.length > 0 && (
                    <p className="truncate text-[9px] text-slate-500">
                      {lora.trigger_words.slice(0, 3).map(String).join(', ')}
                    </p>
                  )}
                </div>
                {selected ? (
                  <Minus className="h-3 w-3 shrink-0 text-violet-400" />
                ) : (
                  <Plus className="h-3 w-3 shrink-0 text-slate-500" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
