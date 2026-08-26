import { NextResponse } from 'next/server';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { readLeadSourceFromRequest } from '@/lib/lead-source';
import { sendCapiEvent } from '@/lib/meta-capi';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  try {
    // Rate limiting by IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rl = rateLimitMiddleware(`signup:${ip}`, RATE_LIMITS.signup);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many registration attempts. Try again later.' }, { status: 429, headers: rl.headers });
    }
    const { email, password, username } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // 投流归因：middleware 写入的 lead_src Cookie（A 站 subid / utm / fbclid）
    const leadSource = readLeadSourceFromRequest(request);

    // Call Supabase Auth REST API directly (bypass GoTrueClient)
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({
        email,
        password,
        data: {
          username: username || email.split('@')[0],
          ...(leadSource ? { lead_source: leadSource } : {}),
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.msg || data.error_description || 'Registration failed' },
        { status: response.status }
      );
    }

    // User created, now sign them in
    const signInResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ email, password }),
    });

    const sessionData = await signInResponse.json();

    if (!signInResponse.ok) {
      // User was created but auto sign-in failed - still return user info
      return NextResponse.json({
        user: data.user || data.id,
        auto_signin_error: sessionData.msg || 'Auto sign-in failed, please sign in manually',
      });
    }

    // Return session + set newbie trial + 归因落库
    const profileClient = getSupabaseClient();
    
    let newbieExpiresAt: string;
    try {
      newbieExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
      const profileUpdate: Record<string, unknown> = { newbie_expires_at: newbieExpiresAt };
      if (leadSource) profileUpdate.lead_source = leadSource;
      
      // Try to update/create profile
      await profileClient
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', sessionData.user.id);
    } catch (profileError) {
      logger.warn('[AUTH:SIGNUP] Profile update failed (non-fatal):', { data: profileError });
      // Don't fail registration - just warn
      newbieExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // Fallback value
    }

    // 服务端 CAPI：注册即 Lead（fire-and-forget，失败不影响注册）
    void sendCapiEvent({
      eventName: 'CompleteRegistration',
      subid: leadSource?.subid,
      fbclid: leadSource?.fbclid,
      email,
      clientIp: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
      landingUrl: request.headers.get('referer') ?? undefined,
    });

    if (leadSource) {
      logger.info('[AUTH:SIGNUP] lead attributed', {
        data: { user_id: sessionData.user.id, lead: leadSource },
      });
    }

    return NextResponse.json({
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token,
      expires_in: sessionData.expires_in,
      expires_at: sessionData.expires_at,
      user: sessionData.user,
      newbie_expires_at: newbieExpiresAt,
    });
  } catch (err) {
    logger.error('[AUTH:SIGNUP] Exception:', { data: err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}