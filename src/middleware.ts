import { NextRequest, NextResponse } from 'next/server';

/**
 * Centralized Middleware for:
 * - Session validation & auth checks
 * - Security headers
 * - Route protection
 * - CSRF prevention (via SameSite cookies)
 */

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/chats',
  '/companion',
  '/account',
  '/profile',
  '/api/v2/chats',
  '/api/v2/companion',
  '/api/v2/user',
  '/api/v2/admin',
  '/api/admin',
];

// Routes accessible only to guests
const GUEST_ONLY_ROUTES = ['/auth', '/login', '/signup'];

// Public routes (no auth required)
const PUBLIC_ROUTES = ['/', '/explore', '/girlfriends', '/pricing', '/api/health', '/api/public'];

// Routes that should skip middleware entirely (handled internally)
const SKIP_AUTH_ROUTES = ['/api/cron', '/api/auth/callback', '/api/stripe/webhook'];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isGuestOnlyRoute(pathname: string): boolean {
  return GUEST_ONLY_ROUTES.some((route) => pathname.startsWith(route));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for routes that handle their own auth internally
  if (SKIP_AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Get session token from cookies (Supabase sets sb-<project>-auth-token)
  const sessionToken = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))
    .map((c) => c.value)
    .find(Boolean);

  // Simple check: token exists (detailed auth validation happens in route handlers via getAuthUser)
  const isAuthenticated = !!sessionToken;

  // Handle protected routes
  if (isProtectedRoute(pathname)) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/auth', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Handle guest-only routes
  if (isGuestOnlyRoute(pathname)) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/chats', request.url));
    }
  }

  // Create response
  const response = NextResponse.next();

  // ✅ Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), usb=()',
  );
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';",
  );

  // ✅ CORS headers for API routes
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || '';
    const allowedOrigins = [
      'https://www.oxmate-ai.com',
      'https://oxmate-ai.com',
      process.env.NEXT_PUBLIC_APP_URL || '',
    ];

    if (allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session');
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }

  // ✅ Caching headers
  if (pathname.startsWith('/api/') || pathname.includes('/manifest.json')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  } else if (isPublicRoute(pathname) || pathname.endsWith('.png') || pathname.endsWith('.jpg')) {
    response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  }

  return response;
}

// Configure which routes should trigger middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - .well-known (well-known paths)
     */
    '/((?!_next/static|_next/image|favicon.ico|.well-known).*)',
  ],
};
