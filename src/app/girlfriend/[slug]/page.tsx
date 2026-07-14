// /girlfriend/[slug]  SSR + ISR 1h
// -  server componentDB  +  URL  waterfall
// - revalidate = 3600Next.js CDN 
// - Add/Chat/Share GirlfriendActions 
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { GirlfriendView } from '@/components/girlfriend-public/GirlfriendView';

// Short ISR so admin media/profile edits surface quickly (also busted via revalidatePath)
export const revalidate = 60;
export const dynamicParams = true;

/**
 *  Railway cold start  < 1s
 *  8  ISR 
 *  ISR
 */
export async function generateStaticParams() {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('girlfriends')
      .select('slug')
      .eq('is_public', true)
      .order('view_count', { ascending: false })
      .limit(8);
    return (data ?? []).map((row: { slug: string }) => ({ slug: row.slug }));
  } catch {
    return [];
  }
}

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

  const raw = data.portrait_url || data.avatar_url || data.card_url || null;
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
    title: `${gf.name}, ${gf.age}  AI Companion`,
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

  //  girlfriend +  slug hover  404
  const gf = await getPublicGirlfriend(slug);
  if (!gf) notFound();

  return (
    <Suspense>
      <GirlfriendView girlfriend={gf} />
    </Suspense>
  );
}
