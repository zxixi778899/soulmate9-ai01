// /girlfriend/[slug] — 公开营销页（SSR + ISR 1h）
// - 顶层 server component：DB 直查 + 签名 URL 解析，避免客户端 waterfall
// - revalidate = 3600：Next.js CDN 边缘缓存，流量越大越省
// - 交互（Add/Chat/Share）拆到 GirlfriendActions 客户端子组件
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { GirlfriendView } from '@/components/girlfriend-public/GirlfriendView';

// 公开页：每 1h 重新生成，签名 URL 30 天内可重复利用。
export const revalidate = 3600;
export const dynamicParams = true;

interface PublicGirlfriend {
  id: string;
  name: string;
  age: number;
  slug: string;
  tags: string[];
  short_description: string;
  personality: string;
  backstory: string;
  portrait_url: string | null;
  avatar_url?: string | null;
  image_url: string | null;
  character_card: any;
}

async function getPublicGirlfriend(slug: string): Promise<PublicGirlfriend | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('girlfriends')
    .select('*')
    .eq('is_public', true)
    .eq('slug', slug)
    .single();

  if (error || !data) {
    if (error && error.code !== 'PGRST116') {
      logger.error('[public-girlfriend] db error', { slug, code: error.code });
    }
    return null;
  }

  const raw = data.portrait_url || data.avatar_url || null;
  const image_url = await resolveImageUrl(raw);

  return {
    ...data,
    image_url,
  } as PublicGirlfriend;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gf = await getPublicGirlfriend(slug);
  if (!gf) return { title: 'Companion not found' };
  const desc = gf.short_description || `Meet ${gf.name}, your AI companion`;
  return {
    title: `${gf.name}, ${gf.age} — AI Companion`,
    description: desc,
    openGraph: {
      title: gf.name,
      description: desc,
      images: gf.image_url ? [gf.image_url] : [],
      type: 'profile',
    },
  };
}

export default async function PublicGirlfriendPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // 并行：拿 girlfriend + 备用（公开女友经常被多个 slug 引用，hover 失败就走 404）
  const gf = await getPublicGirlfriend(slug);
  if (!gf) notFound();

  return (
    <Suspense>
      <GirlfriendView girlfriend={gf} />
    </Suspense>
  );
}
