import { NextResponse, type NextRequest } from 'next/server';
import {
  extractLeadSource,
  serializeLeadCookie,
  LEAD_COOKIE_NAME,
} from '@/lib/lead-source';

/**
 * Ad attribution capture: when the URL carries src/subid/utm_* /fbclid,
 * persist it into the `lead_src` cookie (30 days, first-touch).
 * /api/auth/signup reads the cookie and stores it (profiles.lead_source
 * + user metadata), then fires a server-side CAPI event.
 *
 * Only sets a cookie — no request rewrite, so ISR/SSG caching is unaffected.
 */
export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lead = extractLeadSource(searchParams);
  if (!lead) return NextResponse.next();

  // Keep first-touch data if the cookie already exists
  if (request.cookies.get(LEAD_COOKIE_NAME)?.value) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.headers.set('Set-Cookie', serializeLeadCookie(lead));
  return response;
}

export const config = {
  // Cover page routes; skip static assets and API (API reads cookies directly)
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|json|txt)).*)',
  ],
};
