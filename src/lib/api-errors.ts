import { NextResponse } from 'next/server';

/**
 * Standard API error class with HTTP status and error code.
 * All API routes should throw or return ApiError instances
 * instead of raw NextResponse.json() calls.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toResponse(): NextResponse {
    return NextResponse.json(
      {
        error: this.message,
        code: this.code,
        ...(this.details ? { details: this.details } : {}),
      },
      { status: this.status },
    );
  }
}

/* ──────────────────── Error Factories ──────────────────── */

export function unauthorized(message = 'Authentication required'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Insufficient permissions'): ApiError {
  return new ApiError(403, 'FORBIDDEN', message);
}

export function notFound(resource = 'Resource'): ApiError {
  return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
}

export function badRequest(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message, details);
}

export function rateLimited(retryAfterMs: number): ApiError {
  return new ApiError(429, 'RATE_LIMITED', 'Too many requests', {
    retryAfterMs,
  });
}

export function conflict(message: string): ApiError {
  return new ApiError(409, 'CONFLICT', message);
}

export function internal(message = 'Internal server error'): ApiError {
  return new ApiError(500, 'INTERNAL_ERROR', message);
}

/* ──────────────────── Error Handler ──────────────────── */

/**
 * Maps any error to a safe HTTP response.
 * - ApiError → uses its own status/code
 * - Zod validation errors → 400 with field details
 * - Unknown errors → 500 with generic message (no leak)
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return error.toResponse();
  }

  // Zod v4 validation error
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: string[]; message: string }> };
    const details: Record<string, string> = {};
    for (const issue of zodError.issues) {
      const key = issue.path.join('.') || '_root';
      details[key] = issue.message;
    }
    return new ApiError(400, 'VALIDATION_ERROR', 'Invalid request body', details).toResponse();
  }

  // Unknown error — never leak internals
  return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred').toResponse();
}
