import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/storage/assets
 * 获取公共资源列表 (支持按 ID 删除)
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if (!authResult.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || authResult.user.id;
    
    // Initialize Supabase client with service role
    const supabaseUrl = process.env.COZE_SUPABASE_URL!;
    const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch assets from database
    let query = supabase
      .from('public_assets')
      .select('*')
      .order('uploaded_at', { ascending: false });

    // If userId specified, filter by user
    if (userId && userId !== 'all') {
      query = query.eq('uploaded_by', userId);
    }

    const { data, error } = await query;
    
    if (error) throw error;

    // Get unique categories
    const categories = Array.from(new Set(data.map((asset: any) => asset.category))).filter(Boolean);

    return NextResponse.json({
      success: true,
      assets: data,
      categories,
    });

  } catch (error) {
    console.error('Load assets error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load assets' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/storage/assets?id=<id>
 * 删除资源
 */
export async function DELETE(request: NextRequest) {
  const authResult = await getAuthUser(request);
  if (!authResult.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Asset ID required' }, { status: 400 });
    }

    // Initialize Supabase client with service role
    const supabaseUrl = process.env.COZE_SUPABASE_URL!;
    const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Delete from database
    const { error: dbError } = await supabase
      .from('public_assets')
      .delete()
      .eq('id', id);

    if (dbError) throw dbError;

    return NextResponse.json({
      success: true,
      message: 'Asset deleted',
    });

  } catch (error) {
    console.error('Delete asset error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete asset' },
      { status: 500 }
    );
  }
}
