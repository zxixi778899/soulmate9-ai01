import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://soulmateai.shop';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Call Supabase Auth REST API to trigger a password recovery email
    // POST /auth/v1/recover sends a recovery email with a magic link
    const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({
        email,
        redirect_to: `${SITE_URL}/update-password`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('[AUTH:FORGOT_PASSWORD] API error:', { data: data });
      return NextResponse.json(
        { error: data.msg || data.error_description || 'Failed to send reset link' },
        { status: response.status }
      );
    }

    // For development: if the response includes an action link, return it
    // so developers can test locally without email delivery
    const actionLink = data?.action_link || null;

    return NextResponse.json({
      success: true,
      message: 'If this email is registered, a reset link has been sent',
      // Dev-only: expose the magic link for local testing
      ...(process.env.NODE_ENV === 'development' && actionLink ? { reset_link: actionLink } : {}),
    });
  } catch (err) {
    logger.error('[AUTH:FORGOT_PASSWORD] Exception:', { data: err });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}