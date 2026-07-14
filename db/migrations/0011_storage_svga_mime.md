# Supabase Storage: allow SVGA gift uploads

If SVGA upload still fails with `mime type ... is not supported` after deploy:

## Option A — Dashboard (recommended)

1. Open **Supabase Dashboard** → **Storage** → bucket **`portraits`** (or your `SUPABASE_STORAGE_BUCKET`)
2. **Configuration** / policies
3. Either:
   - **Clear** “Allowed MIME types” (allow all), or
   - Add these MIME types:
     - `image/png`, `image/jpeg`, `image/webp`, `image/gif`
     - `video/mp4`, `video/webm`
     - `application/zip`, `application/x-zip-compressed`
     - `application/octet-stream`
     - `audio/webm`, `audio/mpeg`, `audio/mp4`

App code already calls `updateBucket` with this allowlist on first upload (service role).  
Some projects block `updateBucket` — then use the dashboard.

## Option B — SQL (storage.buckets)

```sql
-- Adjust bucket id/name if needed
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png','image/jpeg','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime','video/x-m4v',
  'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-m4a','audio/mp3',
  'application/octet-stream','application/zip','application/x-zip-compressed',
  'application/x-svga','application/svga'
],
file_size_limit = 52428800
WHERE id = 'portraits';
```

Or allow everything:

```sql
UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'portraits';
```
