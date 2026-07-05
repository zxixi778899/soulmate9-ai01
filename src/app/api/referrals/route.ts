import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/referrals     + 
 * POST /api/referrals   
 *
 * referrals { id, inviter_id, code (UNIQUE), used_by, reward_credits, created_at }
 *  500 Supabase 
 *   CREATE TABLE referrals (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     inviter_id uuid NOT NULL,
 *     code text NOT NULL UNIQUE,
 *     used_by uuid,
 *     reward_credits int DEFAULT 100,
 *     created_at timestamptz DEFAULT now()
 *   );
 *   CREATE INDEX idx_referrals_inviter ON referrals(inviter_id);
 *   CREATE INDEX idx_referrals_code ON referrals(code);
 */

const INVITER_REWARD = 200;
const INVITEE_REWARD = 100;

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  // 
  let { data: code } = await supabase
    .from('referrals')
    .select('code')
    .eq('inviter_id', user.id)
    .is('used_by', null)
    .limit(1)
    .maybeSingle();

  if (!code) {
    const newCode = generateCode();
    const { error } = await supabase.from('referrals').insert({
      inviter_id: user.id,
      code: newCode,
      reward_credits: INVITER_REWARD,
    });
    if (error) {
      logger.error('referral insert failed', { err: error.message });
      return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
    }
    code = { code: newCode };
  }

  //  + 
  const { count: invited } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_id', user.id)
    .not('used_by', 'is', null);

  return NextResponse.json({
    code: code.code,
    inviter_reward: INVITER_REWARD,
    invitee_reward: INVITEE_REWARD,
    invited_count: invited ?? 0,
    share_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/register?ref=${code.code}`,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 });

  const { data: referral, error: findErr } = await supabase
    .from('referrals')
    .select('id, inviter_id, used_by, reward_credits')
    .eq('code', code)
    .maybeSingle();

  if (findErr || !referral) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 404 });
  }
  if (referral.inviter_id === user.id) {
    return NextResponse.json({ error: 'Cannot use your own code' }, { status: 400 });
  }
  if (referral.used_by) {
    return NextResponse.json({ error: 'Code already used' }, { status: 409 });
  }

  //  used_by
  const { data: claimed, error: claimErr } = await supabase
    .from('referrals')
    .update({ used_by: user.id })
    .eq('id', referral.id)
    .is('used_by', null)
    .select('id')
    .maybeSingle();
  if (claimErr || !claimed) {
    return NextResponse.json({ error: 'Code already used' }, { status: 409 });
  }

  // profile.credits_remaining
  await supabase.rpc('grant_credits', { uid: user.id, amount: INVITEE_REWARD }).then(() => null);
  await supabase
    .rpc('grant_credits', { uid: referral.inviter_id, amount: referral.reward_credits ?? INVITER_REWARD })
    .then(() => null);

  return NextResponse.json({
    ok: true,
    invitee_reward: INVITEE_REWARD,
    inviter_reward: referral.reward_credits ?? INVITER_REWARD,
  });
}
