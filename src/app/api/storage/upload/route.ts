import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/storage/upload
 * 上传图片到 Supabase Storage (支持单文件/多文件)
 * 
 * Body: FormData with 'files' (File[]), optional: 'category', 'tags[]'
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if (!authResult.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const category = formData.get('category') as string || 'general';
    const tagsStr = formData.get('tags') as string || '';
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = process.env.COZE_SUPABASE_URL!;
    const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const uploadedFiles = [];
    const bucket = 'assets';

    // Ensure bucket exists (auto-create)
    try {
      await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB per file
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      });
    } catch (e) {
      // Bucket may already exist
      console.log('Bucket creation skipped (may exist):', e);
    }

    for (const file of files) {
      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new Error(`Invalid file type: ${file.name} (${file.type})`);
      }

      // Create unique filename
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `${category}/${authResult.user.id}/${filename}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw new Error(`Upload failed for ${file.name}: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

      uploadedFiles.push({
        id: `asset_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        url: urlData.publicUrl,
        filename: file.name,
        size: file.size,
        category,
        tags,
        uploadedAt: new Date().toISOString(),
      });
    }

    // Store metadata in database
    const { error: dbError } = await supabase
      .from('public_assets')
      .insert(uploadedFiles.map(f => ({
        ...f,
        uploaded_by: authResult.user.id,
      })));

    if (dbError) {
      console.error('Failed to store asset metadata:', dbError);
      // Don't fail the upload if DB insert fails
    }

    return NextResponse.json({
      success: true,
      files: uploadedFiles,
      count: uploadedFiles.length,
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
