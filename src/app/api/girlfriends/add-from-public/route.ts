import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await request.json();
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  // Check if user already owns a girlfriend with this slug
  const { data: existing } = await client
    .from('girlfriends')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ girlfriend: existing, alreadyOwned: true });
  }

  // Fetch the public girlfriend data
  const { data: publicGf, error: fetchError } = await client
    .from('girlfriends')
    .select('*')
    .eq('is_public', true)
    .eq('slug', slug)
    .eq('review_status', 'approved')
    .single();

  if (fetchError || !publicGf) {
    return NextResponse.json({ error: 'Public girlfriend not found' }, { status: 404 });
  }

  // Clone to user's collection
  const insertData: Record<string, unknown> = {
    user_id: user.id,
    name: publicGf.name,
    age: publicGf.age,
    personality: publicGf.personality || '',
    backstory: publicGf.backstory || '',
    tags: publicGf.tags || [],
    short_description: publicGf.short_description || '',
    portrait_url: publicGf.portrait_url || null,
    avatar_url: publicGf.avatar_url || null,
    slug: publicGf.slug,
    appearance_hair: publicGf.appearance_hair || null,
    appearance_hair_color: publicGf.appearance_hair_color || null,
    appearance_eyes: publicGf.appearance_eyes || null,
    appearance_body: publicGf.appearance_body || null,
    appearance_style: publicGf.appearance_style || null,
    is_public: false,
    review_status: 'draft',
    character_card: publicGf.character_card || {
      name: publicGf.name,
      age: publicGf.age,
      description: publicGf.short_description || '',
      personality: publicGf.personality || '',
      tags: publicGf.tags || [],
      first_mes: `*${publicGf.name} smiles warmly at you* Hey there... I've been waiting for you.`,
    },
  };

  const { data: girlfriend, error: insertError } = await client
    .from('girlfriends')
    .insert(insertData)
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Create initial intimacy score
  await client
    .from('intimacy_scores')
    .insert({
      user_id: user.id,
      girlfriend_id: girlfriend.id,
      score: 10, // Starting with a small boost since user already knows her
      level: 1,
      last_daily_reset: new Date().toISOString().split('T')[0],
    });

  return NextResponse.json({ girlfriend, alreadyOwned: false });
}