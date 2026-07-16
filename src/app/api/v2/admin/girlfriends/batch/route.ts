import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { makeGirlfriendSlug } from '@/lib/girlfriend-slug';
import { invalidateGirlfriends } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

//  ENV 
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  || process.env.COZE_SUPABASE_URL
  || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const BATCH_LIMIT = { maxRequests: 20, windowMs: 60 * 60 * 1000 }; // 20/h/admin

//  Random Data Pools 
// 100+ diverse first names for Western market
const FIRST_NAMES = [
  // American/British
  'Emma', 'Olivia', 'Ava', 'Isabella', 'Sophia', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Evelyn',
  'Luna', 'Sofia', 'Camila', 'Aria', 'Scarlett', 'Victoria', 'Aurora', 'Grace', 'Chloe', 'Penelope',
  'Layla', 'Mila', 'Nora', 'Riley', 'Zoey', 'Hannah', 'Ella', 'Lily', 'Natalie', 'Stella',
  'Violet', 'Hazel', 'Avery', 'Savannah', 'Audrey', 'Brooklyn', 'Bella', 'Claire', 'Skylar', 'Lucy',
  'Paisley', 'Everly', 'Anna', 'Caroline', 'Nova', 'Genesis', 'Emilia', 'Kennedy', 'Samantha', 'Maya',
  // European
  'Natasha', 'Anya', 'Irina', 'Svetlana', 'Katarina', 'Milana', 'Daria', 'Polina', 'Veronika', 'Yulia',
  'Ingrid', 'Freya', 'Astrid', 'Bianca', 'Isabella', 'Giulia', 'Francesca', 'Alessia', 'Sofia', 'Elena',
  // Latin
  'Valentina', 'Camila', 'Luciana', 'Fernanda', 'Gabriela', 'Mariana', 'Daniela', 'Carolina', 'Paulina', 'Catalina',
  // Exotic/Unique
  'Zara', 'Nyx', 'Luna', 'Phoenix', 'Sage', 'Ivy', 'Willow', 'Jade', 'Ruby', 'Pearl',
  'Daisy', 'Poppy', 'Iris', 'Violet', 'Rose', 'Lily', 'Jasmine', 'Holly', 'Ivy', 'Flora',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris',
  'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill',
  'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell',
  'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed', 'Cook',
  'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward',
];

// 30+ occupations/professions
const OCCUPATIONS = [
  'model', 'actress', 'dancer', 'singer', 'photographer', 'artist', 'designer', 'architect',
  'doctor', 'nurse', 'therapist', 'psychologist', 'teacher', 'professor', 'researcher', 'scientist',
  'lawyer', 'journalist', 'writer', 'editor', 'marketing manager', 'entrepreneur', 'CEO', 'consultant',
  'chef', 'bartender', 'flight attendant', 'yoga instructor', 'personal trainer', 'fashion blogger',
  'social media influencer', 'real estate agent', 'interior designer', 'event planner', 'travel blogger',
];

// 50+ hair styles
const HAIR_STYLES = [
  'long straight', 'long wavy', 'long curly', 'medium layered', 'medium bob', 'short pixie',
  'short bob', 'shoulder-length', 'braided', 'ponytail', 'messy bun', 'sleek updo',
  'side-swept', 'center-parted', 'bangs', 'no bangs', 'voluminous curls', 'loose waves',
  'tousled', 'sleek and straight', 'textured waves', 'romantic curls', 'beachy waves',
  'elegant updo', 'casual ponytail', 'french braid', 'dutch braid', 'fishtail braid',
  'half-up half-down', 'twisted updo', 'low ponytail', 'high ponytail', 'space buns',
];

// 30+ hair colors
const HAIR_COLORS = [
  'platinum blonde', 'golden blonde', 'honey blonde', 'strawberry blonde', 'ash blonde',
  'light brown', 'medium brown', 'dark brown', 'chestnut', 'chocolate',
  'auburn', 'ginger', 'copper', 'mahogany', 'burgundy',
  'black', 'jet black', 'blue-black', 'silver', 'gray',
  'pastel pink', 'lavender', 'rose gold', 'caramel', 'copper red',
  'platinum white', 'ice blonde', 'warm brunette', 'cool brunette', 'neutral brown',
];

// 25+ eye colors
const EYE_COLORS = [
  'bright blue', 'deep blue', 'ocean blue', 'ice blue', 'sky blue',
  'emerald green', 'forest green', 'jade green', 'hazel', 'amber',
  'golden brown', 'dark brown', 'chocolate brown', 'warm brown', 'light brown',
  'gray', 'storm gray', 'silver', 'violet', 'purple',
  'heterochromia (blue and green)', 'honey', 'copper', 'turquoise', 'aquamarine',
];

// 20+ body types
const BODY_TYPES = [
  'petite and slender', 'tall and slim', 'athletic and toned', 'curvy and confident',
  'hourglass figure', 'lean and fit', 'soft and feminine', 'strong and muscular',
  'petite but curvy', 'tall and statuesque', 'slim and elegant', 'voluptuous',
  'boyish figure', 'pear-shaped', 'athletic build', 'delicate frame',
  'long-legged', 'broad-shouldered', 'narrow-waisted', 'full-figured',
];

// 15+ races/ethnicities
const RACES = [
  'Caucasian', 'Latina', 'Mediterranean', 'Slavic', 'Scandinavian',
  'French', 'Italian', 'Spanish', 'Brazilian', 'Colombian',
  'Russian', 'Polish', 'Greek', 'Portuguese', 'Argentine',
];

// 40+ personality traits (more diverse)
const PERSONALITIES = [
  'Warm and playful, loves making people laugh with silly jokes and spontaneous adventures. Has a contagious laugh that lights up any room.',
  'Quiet and thoughtful, enjoys deep conversations and cozy evenings with a good book. A great listener who always remembers the little details.',
  'Energetic and outgoing, always up for trying new things and meeting new people. The life of the party who makes everyone feel included.',
  'Creative and artistic, sees beauty in everyday moments and loves expressing herself through painting, writing, or music.',
  'Caring and nurturing, always knows how to make someone feel special and loved. The type who remembers your favorite coffee order.',
  'Adventurous and bold, loves exploring new places and pushing boundaries. Has a passport full of stamps and stories to tell.',
  'Sweet and romantic, believes in fairy tales and loves surprising people with thoughtful gestures. Writes handwritten letters.',
  'Confident and independent, knows what she wants and goes after it. A natural leader who inspires others.',
  'Curious and intellectual, loves learning new things and sharing knowledge. Can talk about anything from quantum physics to philosophy.',
  'Fun-loving and spontaneous, lives in the moment and makes every day an adventure. Always ready for a road trip.',
  'Mysterious and intriguing, has an air of sophistication that draws people in. Speaks softly but carries great wisdom.',
  'Sassy and witty, has a sharp tongue and an even sharper mind. Keeps you on your toes with her quick comebacks.',
  'Gentle and compassionate, volunteers at animal shelters and believes in kindness above all else. Has a heart of gold.',
  'Ambitious and driven, balancing a successful career with a rich personal life. Knows how to work hard and play hard.',
  'Free-spirited and bohemian, lives life on her own terms and follows her heart. A dreamer with her feet on the ground.',
  'Playful and flirty, loves teasing and has a mischievous twinkle in her eye. Never takes life too seriously.',
  'Elegant and refined, has impeccable taste and grace in everything she does. The epitome of class and sophistication.',
  'Tomboyish and sporty, prefers sneakers to heels and always ready for a game. Comfortable in her own skin.',
  'Nerdy and adorable, loves video games, comic books, and sci-fi movies. Proof that brains are sexy.',
  'Spiritual and mindful, practices yoga and meditation daily. Has a calming presence that soothes everyone around her.',
];

// 30+ backstories (more diverse and detailed)
const BACKSTORIES = [
  'Grew up in a small coastal town, moved to the city to pursue her dreams. Loves the energy of urban life but misses the sound of ocean waves.',
  'Traveled the world with her family as a child, now settles in one place but still dreams of adventure. Speaks three languages fluently.',
  'Former competitive gymnast who now teaches yoga. Still has the flexibility and discipline from her athletic years.',
  'Self-taught artist who sold her first painting at 16. Now runs her own gallery and mentors young artists.',
  'Medical student by day, aspiring novelist by night. Believes in balancing science and creativity.',
  'Grew up in a big family of seven siblings, learned to be loud and assertive early on. Values family above all else.',
  'Former corporate lawyer who quit to follow her passion for photography. Now travels the world capturing moments.',
  'Tech entrepreneur who built her first app in college. Believes in using technology to make the world better.',
  'Dance instructor who started ballet at age 3. Movement is her language and the studio is her sanctuary.',
  'Journalist who has interviewed celebrities and world leaders. Has stories that could fill a dozen books.',
  'Chef who trained in Paris and now runs her own fusion restaurant. Believes food is the ultimate love language.',
  'Environmental scientist who spends her weekends hiking and cleaning up beaches. Passionate about protecting the planet.',
  'Music producer who has worked with Grammy-winning artists. Lives for the rhythm and melody that fills her life.',
  'Fashion designer who launched her own sustainable clothing line. Proves that style and ethics can coexist.',
  'Psychologist who helps others navigate life challenges while working on her own growth. Believes in the power of vulnerability.',
  'Travel blogger who has visited 50 countries. Collects passport stamps and memories instead of things.',
  'Architect who designs sustainable buildings. Believes that good design can change the world.',
  'Veterinarian who rescues stray animals. Her apartment is a sanctuary for furry friends in need.',
  'Fitness instructor who transformed her own life through health and wellness. Now helps others do the same.',
  'Writer who published her first novel at 25. Draws inspiration from her quirky observations of everyday life.',
];

//  Relationship Roles (immersive settings) 
const ROLES = [
  { role: 'coworker', label: '', desc: 'Your new colleague who sits across from you. Late nights at the office lead to unexpected conversations over coffee.' },
  { role: 'older_sister', label: '', desc: 'The girl next door who has always looked after you. She is a few years older, experienced and caring.' },
  { role: 'younger_sister', label: '', desc: 'A bubbly younger girl who admires you and always wants to tag along. Full of energy and curiosity.' },
  { role: 'neighbor', label: '', desc: 'The attractive woman who lives next door. You keep running into each other in the hallway and elevator.' },
  { role: 'classmate', label: '', desc: 'Your former classmate from university. You reconnected on social media and started chatting again.' },
  { role: 'gym_partner', label: '', desc: 'You see her at the gym every morning. She spotted you once, and now you always work out together.' },
  { role: 'barista', label: '', desc: 'The charming barista at your favorite cafe. She always remembers your order and slips little notes into your cup.' },
  { role: 'personal_trainer', label: '', desc: 'Your personal fitness trainer. She pushes you hard but celebrates every milestone with you.' },
  { role: 'photographer', label: '', desc: 'A freelance photographer who asked to take your portrait. The photo sessions became your favorite time together.' },
  { role: 'bookstore_owner', label: '', desc: 'She runs the cozy bookstore down the street. You started visiting daily just to talk to her.' },
  { role: 'yoga_instructor', label: '', desc: 'Your yoga instructor at the local studio. Her calming voice and gentle corrections make every class special.' },
  { role: 'dog_walker', label: '', desc: 'You keep meeting her at the park while walking your dog. Your dogs became best friends first.' },
  { role: 'childhood_friend', label: '', desc: 'You have known her since you were kids. Over the years, friendship slowly turned into something more.' },
  { role: 'travel_companion', label: '', desc: 'You met by chance while traveling solo. What was supposed to be a one-time encounter turned into daily calls.' },
  { role: 'landlord_daughter', label: '', desc: 'She helps her parents manage the apartment building. Fixing that leaky faucet gave you an excuse to see her again.' },
  { role: 'music_teacher', label: '', desc: 'She teaches piano at the music school nearby. Your lessons became the highlight of your week.' },
];

// 50+ tags (more diverse)
const TAGS_POOL = [
  'creative', 'adventurous', 'romantic', 'intellectual', 'playful', 'caring', 'independent',
  'artistic', 'athletic', 'musical', 'foodie', 'traveler', 'bookworm', 'nature lover',
  'dog person', 'cat person', 'fitness', 'yoga', 'cooking', 'photography',
  'fashion', 'beauty', 'spiritual', 'ambitious', 'free-spirited', 'elegant', 'sassy',
  'nerdy', 'sporty', 'outdoorsy', 'homebody', 'social butterfly', 'night owl', 'early bird',
  'coffee addict', 'tea lover', 'wine enthusiast', 'party animal', 'introvert', 'extrovert',
  'dreamer', 'realist', 'optimist', 'mysterious', 'confident', 'shy', 'bold', 'gentle',
];

//  Helper Functions 
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// slug generation lives in @/lib/girlfriend-slug

//  Generate a unique girlfriend 
function generateGirlfriend(userId: string) {
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const fullName = `${firstName} ${lastName}`;
  const occupation = pick(OCCUPATIONS);
  const roleData = pick(ROLES);

  const hairStyle = pick(HAIR_STYLES);
  const hairColor = pick(HAIR_COLORS);
  const eyeColor = pick(EYE_COLORS);
  const bodyType = pick(BODY_TYPES);
  const race = pick(RACES);
  const style = pick(['casual chic', 'elegant', 'sporty', 'bohemian', 'minimalist', 'trendy', 'classic', 'edgy', 'glamorous', 'street style']);

  const personality = pick(PERSONALITIES);
  const backstory = pick(BACKSTORIES);
  const tags = pickN(TAGS_POOL, 3 + Math.floor(Math.random() * 3)); // 3-5 tags

  // Build detailed appearance description
  const appearanceDescription = `${hairStyle} ${hairColor} hair, ${eyeColor} eyes, ${bodyType} build, ${race} ethnicity`;

  // Build backstory that includes occupation and role
  const fullBackstory = `${roleData.desc} ${backstory} Works as a ${occupation}. ${personality}`;

  // Build character_card with full profile info
  const characterCard = {
    title: fullName,
    description: `${fullName}  your ${roleData.label}. A stunning ${occupation} with ${appearanceDescription}. ${personality}`,
    tags: tags,
    role: roleData.role,
    role_label: roleData.label,
    occupation: occupation,
    appearance: {
      race: race,
      hair_style: hairStyle,
      hair_color: hairColor,
      eyes: eyeColor,
      body: bodyType,
      style: style,
    },
    personality: personality,
    prompt: `A breathtakingly beautiful ${roleData.label} figure, ${appearanceDescription}, wearing ${style} outfit, ${personality.toLowerCase()} expression, professional photography, natural lighting, sharp focus, 8K UHD`,
  };

  return {
    user_id: userId,
    name: fullName,
    slug: makeGirlfriendSlug(fullName),
    personality: personality,
    backstory: fullBackstory,
    appearance_race: race,
    appearance_hair: hairStyle,
    appearance_hair_color: hairColor,
    appearance_eyes: eyeColor,
    appearance_body: bodyType,
    appearance_style: `${occupation}, ${style}`,
    character_card: characterCard,
    is_active: true,
  };
}

//  POST /api/v2/admin/girlfriends/batch 
export async function POST(request: NextRequest) {
  try {
    //  verifyAuth  token  admin  + 
    const guard = await requireAdmin(request);
    if (guard.error) return guard.error;

    const rl = await checkRateLimitAsync(`admin-gf-batch:${guard.user!.id}`, BATCH_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many batch requests. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(rl, BATCH_LIMIT) },
      );
    }

    const userId = guard.user!.id;
    const body = await request.json();
    const count = Math.min(Math.max(body.count || 1, 1), 10);

    logger.info('admin/girlfriends/batch: creating', { count, userId });

    // Generate multiple girlfriends
    const girlfriends = Array.from({ length: count }, () => generateGirlfriend(userId));

    // Insert into database
    const proxyUrl = process.env.COZE_SUPABASE_URL;
    const proxyKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;

    if (!proxyUrl || !proxyKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const insertRes = await fetch(`${proxyUrl}/rest/v1/girlfriends`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: proxyKey,
        Authorization: `Bearer ${proxyKey}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(girlfriends),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      logger.error('admin/girlfriends/batch: insert failed', { errText });
      return NextResponse.json({ error: `Failed to create girlfriends: ${errText}` }, { status: 500 });
    }

    const created = await insertRes.json();
    logger.info('admin/girlfriends/batch: created', { count: created.length, userId });

    invalidateGirlfriends();

    return NextResponse.json({
      success: true,
      count: created.length,
      girlfriends: created,
    });
  } catch (err) {
    logger.error('admin/girlfriends/batch error', { err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
