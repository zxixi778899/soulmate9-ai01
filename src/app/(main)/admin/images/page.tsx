'use client';
import { AdminRedirect } from '@/components/admin/AdminRedirect';

export default function LegacyImagesRedirect() {
  return (
    <AdminRedirect
      to="/admin/girlfriends"
      title="图片库已合并"
      reason="站内伴侣图片/视频/音频统一在「伴侣与媒体」管理（上传、删除、选用）。AI 生图请到「创作工作台」。"
    />
  );
}
