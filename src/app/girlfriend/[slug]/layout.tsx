import type { Metadata } from 'next';
import { APP_NAME } from '@/lib/constants';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://soulmateai.shop';

// Map of known girlfriends for metadata
const GIRLFRIEND_META: Record<string, { name: string; description: string; tags: string[] }> = {
  barbara: { name: 'Barbara', description: 'A sweet and caring companion who loves deep conversations under the stars.', tags: ['Romantic', 'Caring', '18+'] },
  daisy: { name: 'Daisy', description: 'Bubbly and energetic, Daisy brings sunshine to every conversation.', tags: ['Teen', 'Popular', 'Blonde'] },
  itsumi: { name: 'Itsumi', description: 'Mysterious and elegant, Itsumi captivates with every word.', tags: ['Asian', 'Goth', 'MILF'] },
  lexie: { name: 'Lexie', description: 'Bold and confident, Lexie knows exactly what she wants.', tags: ['Ebony', 'Cosplay', '18+'] },
  jessica: { name: 'Jessica', description: 'Warm and nurturing, Jessica is the ultimate caring companion.', tags: ['MILF', 'Romantic', 'Caring'] },
  yuki: { name: 'Yuki', description: 'Shy and gentle, Yuki opens up to those who earn her trust.', tags: ['Asian', 'Teen', 'Caring'] },
  luna: { name: 'Luna', description: 'A free spirit who loves art, music, and late-night conversations.', tags: ['Goth', 'Romantic', 'Cosplay'] },
  aria: { name: 'Aria', description: 'Passionate and fiery, Aria brings intensity to every connection.', tags: ['18+', 'Cosplay', 'Popular'] },
  zoe: { name: 'Zoe', description: 'Playful and adventurous, Zoe is always up for something new.', tags: ['Teen', 'Blonde', 'Trending'] },
  emma: { name: 'Emma', description: 'Sophisticated and intelligent, Emma stimulates both mind and heart.', tags: ['MILF', 'Romantic', 'Caring'] },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const gf = GIRLFRIEND_META[slug];

  if (!gf) {
    return {
      title: `AI Companion  ${APP_NAME}`,
      description: `Meet your perfect AI companion on ${APP_NAME}.`,
    };
  }

  return {
    title: `${gf.name}  ${APP_NAME}`,
    description: `${gf.name}: ${gf.description}`,
    keywords: [...gf.tags, 'AI companion', 'virtual companion', 'virtual relationship', 'NSFW AI chat', slug],
    openGraph: {
      title: `${gf.name}  ${APP_NAME}`,
      description: gf.description,
      url: `${BASE_URL}/girlfriend/${slug}`,
      siteName: APP_NAME,
      images: [{ url: `${BASE_URL}/og/${slug}.jpg`, width: 1200, height: 630 }],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${gf.name}  ${APP_NAME}`,
      description: gf.description,
    },
    alternates: { canonical: `/girlfriend/${slug}` },
  };
}

export default function GirlfriendLayout({ children }: { children: React.ReactNode }) {
  return children;
}