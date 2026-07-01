import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const redirectTo = new URL('/auth/callback', origin).toString();

  // Create server client — cookies go on request, copied to response later
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'email profile',
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/login?error=google_init_failed`);
  }

  // Copy cookies (PKCE verifier) from request to the redirect response
  const response = NextResponse.redirect(data.url);
  request.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 10, // 10 minutes — enough for OAuth flow
    });
  });

  return response;
}