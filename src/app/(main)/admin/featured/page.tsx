'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 推荐/热门已并入「伴侣与媒体」卡片开关 */
export default function FeaturedRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/girlfriends?filter=featured');
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">
      推荐/热门已合并到「伴侣与媒体」…
    </div>
  );
}
