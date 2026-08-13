export type StudioWorkbenchStage = 'id' | 'character-art' | 'outfit' | 'pose' | 'video';

export type StudioEnhancers = {
  controlnet: boolean;
  adetailer: boolean;
  upscale: boolean;
};

export const STUDIO_WORKBENCH_STAGES: Array<{ id: StudioWorkbenchStage; label: string; mode: 'txt2img' | 'img2img' | 'img2video' }> = [
  { id: 'id', label: '生成 ID', mode: 'txt2img' },
  { id: 'character-art', label: '生成立绘', mode: 'txt2img' },
  { id: 'outfit', label: '一键换装', mode: 'img2img' },
  { id: 'pose', label: '一键动作', mode: 'img2img' },
  { id: 'video', label: '视频分镜', mode: 'img2video' },
];

export const DEFAULT_ENHANCERS: StudioEnhancers = { controlnet: false, adetailer: false, upscale: false };

export function resolveWorkbenchRoute(stage: StudioWorkbenchStage, enhancers: StudioEnhancers): string {
  if (stage === 'video') return 'wan22-storyboard';
  if (enhancers.controlnet) return 'flux-controlnet';
  if (enhancers.adetailer) return 'flux-adetailer';
  if (enhancers.upscale) return 'flux-highres';
  return stage === 'id' ? 'flux-identity' : 'flux-studio';
}
