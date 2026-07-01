import { NextRequest, NextResponse } from 'next/server';
import { runpodClient } from '@/lib/runpod';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/require-admin';
import fs from 'fs';

const LOG = '/app/work/logs/bypass//dev.log';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if (adminCheck.error) return adminCheck.error;
  try {
    fs.appendFileSync(LOG, `[BATCH_TEST] Starting at ${new Date().toISOString()}\n`);
    
    const db = getSupabaseClient();
    
    // Same query as batch route
    const { data: girlfriends, error: gfErr } = await db
      .from('girlfriends')
      .select('id, name, avatar_url, slug')
      .is('avatar_url', null);
    
    if (gfErr) {
      fs.appendFileSync(LOG, `[BATCH_TEST] DB error: ${gfErr.message}\n`);
      return NextResponse.json({ error: gfErr.message }, { status: 500 });
    }
    
    fs.appendFileSync(LOG, `[BATCH_TEST] Found ${girlfriends?.length || 0} items needing images\n`);
    
    if (!girlfriends || girlfriends.length === 0) {
      return NextResponse.json({ message: 'No items found (all have images)' });
    }
    
    // Generate for just the first item
    const gf = girlfriends[0];
    fs.appendFileSync(LOG, `[BATCH_TEST] [1/1] Generating for ${gf.name} (${gf.id})\n`);
    
    const params = {
      prompt: `Professional portrait of ${gf.name}, beautiful woman, cinematic lighting, high quality, realistic, 8k, detailed face`,
      negative_prompt: 'nsfw, nude, explicit, deformed, blurry, low quality, watermark, text, signature, bad anatomy, ugly, extra limbs',
      num_images: 1,
      width: 768,
      height: 1024,
    };
    
    fs.appendFileSync(LOG, `[BATCH_TEST] Calling runpodClient.generate()...\n`);
    
    const result = await runpodClient.generate(params);
    
    fs.appendFileSync(LOG, `[BATCH_TEST] Generate returned. images=${result.images?.length || 0}\n`);
    
    return NextResponse.json({
      success: true,
      item: gf.name,
      resultImages: result.images?.length || 0,
      jobId: result.job_id,
      execTime: result.execution_time,
      imageLength: result.images?.[0]?.length || 0,
    });
  } catch (err: any) {
    fs.appendFileSync(LOG, `[BATCH_TEST] ERROR: ${err.message}\n`);
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}