'use client';

import { useState } from 'react';
import { ChevronDown, Shirt, Activity, Mountain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AssetType = 'normal' | 'outfit' | 'action' | 'scene' | 'advertising';

interface AssetTypeOption {
  value: AssetType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const options: AssetTypeOption[] = [
  {
    value: 'normal',
    label: '普通生图',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    description: '标准角色肖像生成',
  },
  {
    value: 'outfit',
    label: '服装生成',
    icon: <Shirt className="h-3.5 w-3.5" />,
    description: '生成高品质服装素材',
  },
  {
    value: 'action',
    label: '动作生成',
    icon: <Activity className="h-3.5 w-3.5" />,
    description: '姿势与动作参考图',
  },
  {
    value: 'scene',
    label: '场景生成',
    icon: <Mountain className="h-3.5 w-3.5" />,
    description: '风景与环境背景',
  },
  {
    value: 'advertising',
    label: '广告素材',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    description: '宣传与推广图片',
  },
];

export function AssetTypeSelector({
  selectedType,
  onSelect,
}: {
  selectedType: AssetType;
  onSelect: (type: AssetType) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const current = options.find(o => o.value === selectedType) || options[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
          selectedType === 'normal'
            ? 'border-violet-500/50 bg-violet-500/10 text-white'
            : 'border-violet-500/40 bg-violet-600 hover:bg-violet-500 text-white',
        )}
      >
        {selectedType === 'normal' ? (
          <>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>文生图</span>
          </>
        ) : (
          <>
            {current.icon}
            <span>{current.label}</span>
          </>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 transition", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d15] shadow-xl">
            <div className="max-h-[70vh] overflow-y-auto p-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onSelect(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition',
                    selectedType === option.value
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <div className={cn(
                    'shrink-0',
                    selectedType === option.value ? 'text-white' : 'text-violet-400 group-hover:text-violet-300'
                  )}>
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{option.label}</div>
                    <div className={cn(
                      'mt-0.5 text-xs',
                      selectedType === option.value ? 'text-violet-200' : 'text-slate-500'
                    )}>
                      {option.description}
                    </div>
                  </div>
                  {selectedType === option.value && (
                    <div className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
                      选中
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
