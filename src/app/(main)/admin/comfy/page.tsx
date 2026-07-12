'use client';
import { AdminRedirect } from '@/components/admin/AdminRedirect';

export default function LegacyComfyRedirect() {
  return (
    <AdminRedirect
      to="/admin/studio"
      title="Comfy 已并入创作工作台"
      reason="出图 / 模型 / 资产归档统一从「创作工作台」进入。模型库入口仍保留在侧栏。"
    />
  );
}
