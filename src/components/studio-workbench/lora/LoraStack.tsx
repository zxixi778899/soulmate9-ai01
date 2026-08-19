'use client';

import { useStudio } from '../StudioContext';
import { X } from 'lucide-react';

export function LoraStack() {
  const { state, dispatch, generationRoute } = useStudio();

  // Get lora metadata from config
  const allLoras: Array<Record<string, unknown>> = state.config?.loras || [];

  // 只展示与当前模型族匹配的 LoRA（禁止跨族混用）
  const familyLoras = allLoras.filter((l) => String(l.family || '').toLowerCase() === generationRoute.modelFamily);

  if (state.selectedLoras.length === 0 && !state.advancedMode) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          LoRA 插件
        </label>
        <span className="text-[10px] text-slate-600">{state.selectedLoras.length}/4</span>
      </div>

      {state.selectedLoras.length === 0 ? (
        <p className="mt-1 text-[10px] text-slate-600">未选择 LoRA，可在高级模式中添加</p>
      ) : (
        <div className="mt-2 space-y-2">
          {state.selectedLoras.map((sel) => {
            const meta = allLoras.find((l) => l.id === sel.id);
            const name = String(meta?.label || meta?.id || sel.id);
            const category = String(meta?.category || '');
            return (
              <div key={sel.id} className="rounded-lg border border-white/5 bg-[#0d0d15] p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-[11px] font-medium text-white">{name}</span>
                    {category && (
                      <span className="shrink-0 rounded bg-white/5 px-1 text-[9px] text-slate-500">{category}</span>
                    )}
                  </div>
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_LORA', id: sel.id })}
                    className="shrink-0 rounded p-0.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={1.2}
                    step={0.05}
                    value={sel.strength}
                    onChange={(e) => dispatch({ type: 'SET_LORA_STRENGTH', id: sel.id, strength: +e.target.value })}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="w-8 text-right font-mono text-[10px] text-slate-400">
                    {sel.strength.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick add from available LoRAs (advanced mode, 按当前模型族过滤) */}
      {state.advancedMode && state.selectedLoras.length < 4 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-violet-400 hover:text-violet-300">
            + 添加 LoRA（{generationRoute.modelFamily.toUpperCase()}）
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
            {familyLoras.length === 0 && (
              <p className="px-2 py-1 text-[10px] text-slate-600">当前模型族暂无可用 LoRA</p>
            )}
            {familyLoras
              .filter((l) => l.id && l.id !== 'none' && !state.selectedLoras.some((s) => s.id === l.id))
              .slice(0, 20)
              .map((lora) => (
                <button
                  key={String(lora.id)}
                  onClick={() => dispatch({ type: 'ADD_LORA', lora: { id: String(lora.id), strength: 0.7 } })}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11px] text-slate-400 hover:bg-white/5 hover:text-white transition"
                >
                  <span className="truncate">{String(lora.label || lora.id)}</span>
                  <span className="text-[9px] text-slate-600">{String(lora.category || '')}</span>
                </button>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
