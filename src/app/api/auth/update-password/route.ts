import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  try {
    const { access_token, new_password } = await request.json();

    if (!access_token || !new_password) {
      return NextResponse.json(
        { error: 'access_token and new_password are required' },
        { status: 400 }
      );
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Update the user's password via Supabase Auth REST API
    // The access_token is sent as a Bearer token to authenticate the request
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        password: new_password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[AUTH:UPDATE_PASSWORD] API error:', data);
      return NextResponse.json(
        { error: data.msg || data.error_description || 'Failed to update password' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (err) {
    console.error('[AUTH:UPDATE_PASSWORD] Exception:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}