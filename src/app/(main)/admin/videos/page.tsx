'use client';
import { AdminRedirect } from '@/components/admin/AdminRedirect';

export default function LegacyVideosRedirect() {
  return (
    <AdminRedirect
      to="/admin/girlfriends"
      title="视频库已合并"
      reason="视频上传与删除已并入「伴侣与媒体」。请在伴侣卡片上管理肖像/头像视频。"
    />
  );
}
