/**
 * Browser helper: sign → direct PUT to Supabase → optional bind to girlfriend.
 */

export type VideoField = 'portrait_video_url' | 'avatar_video_url';

export interface VideoUploadResult {
  url: string;
  key: string | null;
  field: VideoField;
  bound: boolean;
}

function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return data.access_token || null;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

function authedHeaders(json = true): HeadersInit {
  const token = getSessionToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'x-session': token } : {}),
  };
}

/**
 * Upload a video File (mp4/webm/mov) via signed URL.
 * Max ~50MB (bucket policy); Vercel is not in the data path.
 */
export async function uploadGirlfriendVideo(opts: {
  file: File;
  field?: VideoField;
  girlfriendId?: string | null;
  onProgress?: (phase: 'sign' | 'put' | 'complete') => void;
}): Promise<VideoUploadResult> {
  const file = opts.file;
  if (!file) throw new Error('没有选择文件');

  const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
  // Some browsers send empty type for .mp4
  const contentType =
    file.type && file.type.startsWith('video/')
      ? file.type
      : file.name.toLowerCase().endsWith('.webm')
        ? 'video/webm'
        : file.name.toLowerCase().endsWith('.mov')
          ? 'video/quicktime'
          : 'video/mp4';

  if (file.type && !allowed.includes(file.type) && !file.type.startsWith('video/')) {
    throw new Error(`不支持的格式：${file.type || file.name}（请用 mp4 / webm）`);
  }

  const maxBytes = 50 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大 50MB`);
  }
  if (file.size < 1024) {
    throw new Error('文件过小，不像有效视频');
  }

  opts.onProgress?.('sign');
  const signRes = await fetch('/api/admin/videos/upload-url', {
    method: 'POST',
    headers: authedHeaders(true),
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      folder: 'admin/videos',
      girlfriendId: opts.girlfriendId || undefined,
      field: opts.field || 'portrait_video_url',
    }),
  });
  const signData = await signRes.json().catch(() => ({}));
  if (!signRes.ok) {
    throw new Error(signData.error || `获取上传地址失败 (${signRes.status})`);
  }

  opts.onProgress?.('put');
  // Supabase signed upload expects multipart FormData (see storage-js uploadToSignedUrl)
  const form = new FormData();
  form.append('cacheControl', '31536000');
  form.append('', file);
  const putRes = await fetch(signData.signedUrl as string, {
    method: 'PUT',
    headers: {
      'x-upsert': 'true',
    },
    body: form,
  });
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '');
    throw new Error(
      `直传存储失败 (${putRes.status}): ${t.slice(0, 160) || putRes.statusText}`,
    );
  }

  opts.onProgress?.('complete');
  const completeRes = await fetch('/api/admin/videos/complete', {
    method: 'POST',
    headers: authedHeaders(true),
    body: JSON.stringify({
      key: signData.key,
      url: signData.publicUrl,
      girlfriendId: opts.girlfriendId || undefined,
      field: opts.field || 'portrait_video_url',
    }),
  });
  const completeData = await completeRes.json().catch(() => ({}));
  if (!completeRes.ok) {
    // Upload succeeded — still return public URL for form use
    if (signData.publicUrl) {
      return {
        url: signData.publicUrl as string,
        key: (signData.key as string) || null,
        field: (opts.field || 'portrait_video_url') as VideoField,
        bound: false,
      };
    }
    throw new Error(completeData.error || '上传后绑定失败');
  }

  return {
    url: (completeData.url || signData.publicUrl) as string,
    key: (completeData.key || signData.key || null) as string | null,
    field: (completeData.field || opts.field || 'portrait_video_url') as VideoField,
    bound: !!completeData.bound,
  };
}
