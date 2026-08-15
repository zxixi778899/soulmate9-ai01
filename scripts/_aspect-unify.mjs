// TEMP: unify companion art containers aspect-[3/4] -> aspect-[2/3]
// (source art is generated at 832x1216 = 2:3, so matching the container
// eliminates object-cover cropping). Run: node scripts/_aspect-unify.mjs
import fs from 'node:fs';
import path from 'node:path';

const targets = [
  'src/app/(main)/admin/comfy/ComfyConsole.tsx',
  'src/app/(main)/admin/girlfriends/page.tsx',
  'src/app/(main)/admin/model-library/page.tsx',
  'src/app/(main)/admin/shop/page.tsx',
  'src/app/(main)/category/[slug]/page.tsx',
  'src/app/(main)/chats/page.tsx',
  'src/app/(main)/create/page.tsx',
  'src/app/(main)/explore/page.tsx',
  'src/app/(main)/profile/page.tsx',
  'src/app/(main)/shop/page.tsx',
  'src/app/(main)/summon/page.tsx',
  'src/app/(main)/u/[userId]/page.tsx',
  'src/app/(main)/wallet/page.tsx',
  'src/app/(main)/wardrobe/page.tsx',
  'src/app/page.tsx',
  'src/components/admin/AdminAssetsContent.tsx',
  'src/components/admin/AdminPresetLibraryContent.tsx',
  'src/components/admin/CreatorPreviewsAdminContent.tsx',
  'src/components/chat/ChatStream.tsx',
  'src/components/chat/ChatView.tsx',
  'src/components/creator/CreateSuccessModal.tsx',
  'src/components/discover/CompanionDetailModal.tsx',
  'src/components/discover/GirlfriendCard.tsx',
  'src/components/ShareCard.tsx',
  'src/components/wardrobe-dialog.tsx',
];

let total = 0;
for (const rel of targets) {
  const abs = path.resolve(rel);
  const src = fs.readFileSync(abs, 'utf8');
  const count = src.split('aspect-[3/4]').length - 1;
  if (count === 0) { console.log('skip (0)', rel); continue; }
  fs.writeFileSync(abs, src.replaceAll('aspect-[3/4]', 'aspect-[2/3]'));
  total += count;
  console.log(`replaced ${count} in ${rel}`);
}
console.log('TOTAL', total);
