/**
 * Composable API Route Handler Factory
 *
 * Eliminates duplicated auth/rate-limit/validation boilerplate
 * across all 89+ API routes. Usage:
 *
 * ```ts
 * // Simple authenticated route
 * export const GET = withAuth(async (req, { user, client }) => {
 *   const data = await client.from('items').select('*').eq('user_id', user.id);
 *   return NextResponse.json(data);
 * });
 *
 * // With validation + rate limiting
 * export const POST = createRoute({
 *   auth: true,
 *   rateLimit: { action: 'create_item', maxRequests: 10, windowMs: 60_000 },
 *   validate: z.object({ name: z.string().min(1) }),
 *   handler: async (req, { user, client, body }) => {
 *     // body is fully typed and validated
 *   },
 * });
 *
 * // Admin-only route
 * export const PATCH = withAdmin(async (req, { user, supabase, profile }) => {
 *   // admin-only logic
 * });
 * ```
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { requireAdmin, type AdminRole } from '@/lib/require-admin';
import { checkRateLimitAsync, type RateLimitConfig } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { ApiError, handleApiError, rateLimited } from './api-errors';

/* ──────────────────── Types ──────────────────── */

export interface AuthContext {
  user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>['user']>;
  client: NonNullable<Awaited<ReturnType<typeof getAuthUser>>['client']>;
}

export interface AdminContext {
  user: AuthContext['user'];
  profile: Record<string, unknown>;
  supabase: AuthContext['client'];
}

type AuthHandler<T = void> = (
  req: NextRequest,
  ctx: AuthContext & { body: T },
) => Promise<NextResponse>;

type AuthHandlerNoBody = (
  req: NextRequest,
  ctx: AuthContext,
) => Promise<NextResponse>;

type AdminHandler = (
  req: NextRequest,
  ctx: AdminContext,
) => Promise<NextResponse>;

/* ──────────────────── withAuth ──────────────────── */

/**
 * Wraps a route handler with authentication.
 * Provides typed `{ user, client }` in the context object.
 */
export function withAuth(
  handler: AuthHandlerNoBody,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const { user, client, error } = await getAuthUser(req);
      if (error || !user || !client) {
        return new ApiError(401, 'UNAUTHORIZED', 'Authentication required').toResponse();
      }
      return await handler(req, { user, client });
    } catch (err) {
      logger.error('api-handler: withAuth error', { error: err });
      captureException(err);
      return handleApiError(err);
    }
  };
}

/* ──────────────────── withAuthBody ──────────────────── */

/**
 * Like withAuth but also parses and validates the JSON body.
 * Pass a Zod schema for runtime validation + type inference.
 */
export function withAuthBody<T>(
  schema: { parse: (input: unknown) => T },
  handler: AuthHandler<T>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const { user, client, error } = await getAuthUser(req);
      if (error || !user || !client) {
        return new ApiError(401, 'UNAUTHORIZED', 'Authentication required').toResponse();
      }

      let rawBody: unknown;
      try {
        rawBody = await req.json();
      } catch {
        return new ApiError(400, 'BAD_REQUEST', 'Invalid JSON body').toResponse();
      }

      const body = schema.parse(rawBody);
      return await handler(req, { user, client, body });
    } catch (err) {
      logger.error('api-handler: withAuthBody error', { error: err });
      captureException(err);
      return handleApiError(err);
    }
  };
}

/* ──────────────────── withAdmin ──────────────────── */

/**
 * Wraps a route handler with admin RBAC.
 * Provides typed `{ user, profile, supabase }` in the context.
 */
export function withAdmin(
  handler: AdminHandler,
  minRole: AdminRole = 'admin',
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const result = await requireAdmin(req, minRole);
      if (result.error) return result.error;
      const { user, profile, supabase } = result;
      return await handler(req, {
        user,
        profile: (profile || {}) as Record<string, unknown>,
        supabase,
      });
    } catch (err) {
      logger.error('api-handler: withAdmin error', { error: err });
      captureException(err);
      return handleApiError(err);
    }
  };
}

/* ──────────────────── createRoute (all-in-one) ──────────────────── */

export interface RouteConfig<T = void> {
  /** Require authentication (default: true) */
  auth?: boolean;
  /** Require admin role (implies auth) */
  admin?: AdminRole;
  /** Rate limit config */
  rateLimit?: { action: string } & RateLimitConfig;
  /** Zod schema for body validation (POST/PATCH/PUT) */
  validate?: { parse: (input: unknown) => T };
  /** The actual handler */
  handler: (
    req: NextRequest,
    ctx: AuthContext & {
      body: T | undefined;
      isAdmin: boolean;
      profile?: Record<string, unknown>;
    },
  ) => Promise<NextResponse>;
}

/**
 * All-in-one composable route handler.
 * Combines auth + admin + rate limit + validation into one call.
 */
export function createRoute<T = void>(
  config: RouteConfig<T>,
): (req: NextRequest) => Promise<NextResponse> {
  const { auth = true, admin, rateLimit, validate, handler } = config;

  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // 1. Auth check
      let user: AuthContext['user'] | null = null;
      let client: AuthContext['client'] | null = null;

      if (auth || admin) {
        const authResult = await getAuthUser(req);
        if (authResult.error || !authResult.user || !authResult.client) {
          return new ApiError(401, 'UNAUTHORIZED', 'Authentication required').toResponse();
        }
        user = authResult.user;
        client = authResult.client;
      }

      // 2. Admin check
      let profile: Record<string, unknown> | undefined;
      if (admin && user) {
        const adminResult = await requireAdmin(req, admin);
        if (adminResult.error) return adminResult.error;
        profile = (adminResult.profile || {}) as Record<string, unknown>;
      }

      // 3. Rate limit
      if (rateLimit && user) {
        const rlKey = `${rateLimit.action}:${user.id}`;
        const rl = await checkRateLimitAsync(rlKey, {
          maxRequests: rateLimit.maxRequests,
          windowMs: rateLimit.windowMs,
        });
        if (!rl.allowed) {
          return rateLimited(rl.resetInMs).toResponse();
        }
      }

      // 4. Body validation
      let body: T | undefined;
      if (validate) {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return new ApiError(400, 'BAD_REQUEST', 'Invalid JSON body').toResponse();
        }
        body = validate.parse(rawBody) as T;
      }

      // 5. Execute handler
      return await handler(req, {
        user: user!,
        client: client!,
        body,
        isAdmin: !!admin,
        profile,
      });
    } catch (err) {
      logger.error('api-handler: createRoute error', { error: err });
      captureException(err);
      return handleApiError(err);
    }
  };
}
