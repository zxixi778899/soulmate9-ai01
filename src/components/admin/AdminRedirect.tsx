'use client';

/**
 * 旧入口兼容跳转：图片库 / 视频库 → 女友与媒体
 * Comfy / 生成卡片 → 创作工作台
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export function AdminRedirect({
  to,
  title,
  reason,
}: {
  to: string;
  title: string;
  reason: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(to), 600);
    return () => clearTimeout(t);
  }, [router, to]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
      <h1 className="text-lg font-semibold text-[#1E293B]">{title}</h1>
      <p className="max-w-md text-sm text-[#64748B]">{reason}</p>
      <Link href={to} className="text-sm font-medium text-[#2563EB] underline">
        立即前往 →
      </Link>
    </div>
  );
}
