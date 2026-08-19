'use client';

/**
 * 公共资产库页面 - 服装库 / 动作库 / 场景库 / 广告库
 */
import AssetLibrary from '@/components/admin/AssetLibrary';

export default function AdminAssetsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <AssetLibrary />
    </div>
  );
}
