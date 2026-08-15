// TEMP: UI unify pass
// 1) circular companion avatars anchor to the face (object-top)
// 2) page shells drop max-w caps -> full-bleed site-wide
// Run: node scripts/_ui-unify.mjs
import fs from 'node:fs';
import path from 'node:path';

function apply(rel, pairs) {
  const abs = path.resolve(rel);
  let src = fs.readFileSync(abs, 'utf8');
  let n = 0;
  for (const [from, to] of pairs) {
    const count = src.split(from).length - 1;
    if (count > 0) {
      src = src.split(from).join(to);
      n += count;
    }
  }
  if (n > 0) fs.writeFileSync(abs, src);
  console.log(`${n ? 'edited' : 'skip '} ${n} in ${rel}`);
}

// ── 1) face-anchored circular avatars ──
const AVATAR_ROUND = [['rounded-full object-cover', 'rounded-full object-cover object-top']];
for (const f of [
  'src/app/(main)/admin/leaderboard/page.tsx',
  'src/app/(main)/companion/[id]/page.tsx',
  'src/app/(main)/profile/page.tsx',
  'src/app/(main)/u/[userId]/page.tsx',
  'src/app/(main)/voice/page.tsx',
  'src/components/chat/ChatStream.tsx',
]) apply(f, AVATAR_ROUND);

apply('src/app/(main)/explore/page.tsx', [['className="w-full h-full object-cover" />', 'className="w-full h-full object-cover object-top" />']]);
apply('src/app/page.tsx', [['className="w-full h-full object-cover" draggable={false}', 'className="w-full h-full object-cover object-top" draggable={false}']]);
apply('src/components/girlfriend-public/GirlfriendView.tsx', [['className="object-cover"', 'className="object-cover object-top"']]);
apply('src/components/ui/avatar.tsx', [['"aspect-square size-full"', '"aspect-square size-full object-cover object-top"']]);

// ── 2) full-bleed page shells (drop max-w caps) ──
const WIDTH = [
  ['max-w-7xl', 'max-w-none'],
  ['max-w-6xl', 'max-w-none'],
  ['max-w-5xl', 'max-w-none'],
];
for (const f of [
  'src/app/page.tsx',
  'src/app/(main)/category/[slug]/page.tsx',
  'src/app/(main)/create/page.tsx',
  'src/app/(main)/explore/page.tsx',
  'src/app/(main)/pricing/page.tsx',
  'src/app/(main)/quest/page.tsx',
  'src/app/(main)/shop/page.tsx',
  'src/app/(main)/studio/page.tsx',
  'src/app/(main)/wallet/page.tsx',
  'src/app/(main)/wardrobe/page.tsx',
  'src/app/(main)/chats/page.tsx',
  'src/app/(main)/admin/gifts/page.tsx',
  'src/components/admin/CreatorPreviewsAdminContent.tsx',
  'src/components/game/PageHeader.tsx',
  'src/components/girlfriend-public/GirlfriendView.tsx',
  'src/components/GlobalTopNav.tsx',
]) apply(f, WIDTH);
