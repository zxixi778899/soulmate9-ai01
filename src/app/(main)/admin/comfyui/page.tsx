'use client';

import { AdminRedirect } from '@/components/admin/AdminRedirect';

export default function LegacyComfyUiRedirect(): React.JSX.Element {
  return (
    <AdminRedirect
      to="/admin/studio"
      title="ComfyUI 已合并到创作工作台"
      reason="模型、LoRA、IP-Adapter、工作流导入和 Wan 2.2 视频现在统一在一个专业工作页中。"
    />
  );
}
