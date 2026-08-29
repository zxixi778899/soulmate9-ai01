import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getAuthUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/storage/thumbnails/generate
 * 批量生成缩略图
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if (!authResult.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const assetIds = body.assetIds as string[];
    const sizes = body.sizes || ['thumb', 'medium', 'large']; // thumb: 256px, medium: 768px, large: 1920px
    
    if (!assetIds || assetIds.length === 0) {
      return NextResponse.json(
        { error: 'No asset IDs provided' },
        { status: 400 }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = process.env.COZE_SUPABASE_URL!;
    const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch assets
    const { data: assets } = await supabase
      .from('public_assets')
      .select('*')
      .in('id', assetIds);

    if (!assets || assets.length === 0) {
      throw new Error('No assets found');
    }

    const generatedThumbnails = [];

    for (const asset of assets) {
      // Parse URLs if multiple
      const urls = asset.url.split(',').map((u: string) => u.trim());
      
      for (const url of urls) {
        try {
          // Download original image
          const imgResponse = await fetch(url);
          if (!imgResponse.ok) continue;
          
          const imgBuffer = await imgResponse.arrayBuffer();
          
          // Generate thumbnails for each size
          const thumbnailPromises = sizes.map(async (size: 'thumb' | 'medium' | 'large') => {
            let width = 256; // thumb
            let height = 256;
            
            if (size === 'medium') {
              width = 768;
              height = 768;
            } else if (size === 'large') {
              width = 1920;
              height = 1920;
            }
            
            // Generate thumbnail using sharp
            const thumbnailPath = `${asset.category}/${authResult.user.id}/${asset.filename.replace(/\.[^.]+$/, '')}_${size}.jpg`;
            
            const thumbnailBuffer = await sharp(imgBuffer)
              .resize(width, height, {
                fit: 'cover',
                position: 'center',
              })
              .jpeg({ quality: 70 })
              .toBuffer();
            
            // Upload to Supabase Storage
            const bucket = 'assets';
            const { data, error } = await supabase.storage
              .from(bucket)
              .upload(thumbnailPath, thumbnailBuffer, {
                contentType: 'image/jpeg',
                upsert: false,
              });
            
            if (error) {
              console.error(`Failed to upload thumbnail for ${asset.id}:`, error);
              return null;
            }
            
            // Get public URL
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(thumbnailPath);
            
            return {
              assetId: asset.id,
              size,
              url: urlData.publicUrl,
              path: thumbnailPath,
              width,
              height,
            };
          });
          
          const results = await Promise.all(thumbnailPromises);
          generatedThumbnails.push(...results.filter(Boolean));
          
        } catch (err) {
          console.error(`Failed to generate thumbnails for ${asset.id}:`, err);
        }
      }
    }

    // Update database with thumbnail URLs
    const thumbnailUpdates = generatedThumbnails.reduce((acc, t) => {
      const existing = acc[t.assetId] || {};
      existing[t.size] = t.url;
      acc[t.assetId] = existing;
      return acc;
    }, {} as Record<string, Record<string, string>>);

    for (const [assetId, sizesMap] of Object.entries(thumbnailUpdates)) {
      const { error } = await supabase
        .from('public_assets')
        .update({ thumbnail_urls: sizesMap })
        .eq('id', assetId);
      
      if (error) {
        console.error(`Failed to update thumbnails for ${assetId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      count: generatedThumbnails.length,
      thumbnails: generatedThumbnails,
    });

  } catch (error) {
    console.error('Generate thumbnails error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate thumbnails' },
      { status: 500 }
    );
  }
}
