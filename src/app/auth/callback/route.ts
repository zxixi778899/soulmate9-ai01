import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const STORAGE_KEY = 'sb-ywktqpaycmuoxnzxxlbr-auth-token';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle OAuth error from Supabase
  if (error || errorDescription) {
    logger.error('[Auth Callback] OAuth error from Supabase:', { error, errorDescription });
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription || error || 'auth_failed')}`
    );
  }

  if (!code) {
    logger.error('[Auth Callback] No code in callback URL. Full URL:', { data: request.url });
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
      },
    },
  });

  try {
    // Exchange code for session (reads PKCE verifier from cookie)
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !data.session) {
      logger.error('[Auth Callback] Code exchange failed:', { data: exchangeError?.message });
      return NextResponse.redirect(
        `${origin}/login?error=exchange_failed&details=${encodeURIComponent(exchangeError?.message || 'unknown')}`
      );
    }

    const session = data.session;

    const sessionData = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user,
    };

    const sessionJson = JSON.stringify(sessionData);

    // Return HTML page that writes session to localStorage
    const html = `<!DOCTYPE html>
<html>
<head><title>Signing in...</title></head>
<body>
<script>
try {
  localStorage.setItem('${STORAGE_KEY}', ${JSON.stringify(sessionJson)});
  window.location.href = '/';
} catch(e) {
  logger.error('Failed to store session:', { data: e });
  window.location.href = '/login?error=storage_failed';
}
</script>
<p>Signing you in...</p>
</body>
</html>`;

    const response = new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

    // Copy any auth cookies from the request (set by exchangeCodeForSession)
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.includes('sb-') || cookie.name.includes('supabase')) {
        response.cookies.set(cookie.name, cookie.value, {
          httpOnly: true,
          sameSite: 'lax',
          secure: true,
          path: '/',
        });
      }
    });

    return response;
  } catch (err) {
    logger.error('[Auth Callback] Exception:', { data: err });
    return NextResponse.redirect(`${origin}/login?error=callback_error`);
   }
}
