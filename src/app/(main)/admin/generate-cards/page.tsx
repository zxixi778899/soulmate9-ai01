'use client';
import { AdminRedirect } from '@/components/admin/AdminRedirect';

export default function LegacyGenerateCardsRedirect() {
  return (
    <AdminRedirect
      to="/admin/studio"
      title="生成卡片已并入创作工作台"
      reason="批量/单卡生成请使用创作工作台；生成结果在公共资产库，绑定到伴侣请用「伴侣与媒体」。"
    />
  );
}
