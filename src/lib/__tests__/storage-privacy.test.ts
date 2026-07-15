import { beforeEach, describe, expect, it } from 'vitest';
import { extractKeyFromUrl, toPublicUrl } from '@/lib/storage';

describe('storage privacy boundary', () => {
  beforeEach(() => {
    process.env.COZE_SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_STORAGE_BUCKET = 'public-assets';
    process.env.SUPABASE_PRIVATE_STORAGE_BUCKET = 'user-media';
  });

  it('never turns a private storage key into a public URL', () => {
    expect(toPublicUrl('private:users/user-1/photo.png')).toBe('');
  });

  it('keeps catalog assets on the public bucket', () => {
    expect(toPublicUrl('admin/catalog/dress.png'))
      .toBe('https://project.supabase.co/storage/v1/object/public/public-assets/admin/catalog/dress.png');
  });

  it('preserves private scope when extracting a signed Supabase URL', () => {
    expect(extractKeyFromUrl(
      'https://project.supabase.co/storage/v1/object/sign/user-media/users/user-1/photo.png?token=abc',
    )).toBe('private:users/user-1/photo.png');
  });
});
