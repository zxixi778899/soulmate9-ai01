'use client';

import { useStudio } from '../StudioContext';
import { cn } from '@/lib/utils';
import { Shirt, Move, Mountain, Users, ImageIcon, Play, type LucideIcon } from 'lucide-react';
import type { StudioTask } from '../StudioWorkbench.types';

const TASKS: Array<{ id: StudioTask | 'video'; label: string; icon: LucideIcon; hint: string; mode: 'txt2img' | 'img2img' | 'img2video' }> = [
  { id: 'identity', label: '生成角色', icon: Users, hint: '建立身份参考', mode: 'txt2img' },
  { id: 'portrait', label: '生成立绘', icon: ImageIcon, hint: '继承角色外观', mode: 'txt2img' },
  { id: 'outfit', label: '一键换装', icon: Shirt, hint: '保持人物换服装', mode: 'img2img' },
  { id: 'pose', label: '一键姿势', icon: Move, hint: '保持人物换动作', mode: 'img2img' },
  { id: 'background', label: '一键背景', icon: Mountain, hint: '保持人物换场景', mode: 'img2img' },
  { id: 'video', label: 'Wan 视频', icon: Play, hint: '图生动画', mode: 'img2video' },
];

export function QuickTransformBar() {
  const { state, dispatch } = useStudio();

  const handleClick = (task: typeof TASKS[number]) => {
    if (task.mode === 'img2video') {
      dispatch({ type: 'SET_MODE', genMode: 'img2video' });
      dispatch({ type: 'SET_TASK', task: 'video' });
      return;
    }
    if (task.id === 'identity' || task.id === 'portrait') {
      dispatch({ type: 'SET_MODE', genMode: 'txt2img' });
      dispatch({ type: 'SET_TASK', task: task.id });
      return;
    }
    // img2img transforms
    dispatch({ type: 'APPLY_TRANSFORM', kind: task.id as 'outfit' | 'pose' | 'background' });
    // Auto-select most recent character image as reference
    if (!state.inputImage && state.companionAssets.length > 0) {
      const avatarAsset = state.companionAssets.find(
        (a) => String(a.meta?.asset_role || a.asset_role || '') === 'avatar-closeup'
      );
      const anyCharacter = state.companionAssets.find(
        (a) => ['character-art', 'avatar-closeup', 'scene', 'album'].includes(String(a.meta?.asset_role || a.asset_role || ''))
      );
      const refUrl = String((avatarAsset || anyCharacter)?.url || '');
      if (refUrl) dispatch({ type: 'SET_INPUT_IMAGE', url: refUrl });
    }
  };

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {TASKS.map((task) => {
        const active = state.studioTask === task.id && state.genMode === task.mode;
        return (
          <button
            key={task.id}
            onClick={() => handleClick(task)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition',
              active
                ? 'border-violet-500/50 bg-violet-500/15 text-violet-200 shadow-sm'
                : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:bg-white/5 hover:text-white',
            )}
          >
            <task.icon className={cn('h-4 w-4', active ? 'text-violet-300' : 'text-slate-500')} />
            <span className="text-[10px] font-medium leading-tight">{task.label}</span>
          </button>
        );
      })}
    </div>
  );
}
