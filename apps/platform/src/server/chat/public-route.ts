import 'server-only';

import { z } from 'zod';

import { ForbiddenError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { enforceTrackingRateLimit } from '@/server/tracking/rate-limit';

function withAllowedOrigin(response: Response, origin: string): Response {
  response.headers.set('access-control-allow-origin', origin);
  response.headers.set('vary', 'Origin');
  return response;
}

/**
 * Browsers do not consistently attach an Origin header to a same-origin GET.
 * The tracker fixture (and a platform installed on the tracked site's origin)
 * must still be subject to the same allow-list check, so use the referrer
 * origin as a narrowly-scoped fallback.
 */
export function getPublicRequestOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const referer = request.headers.get('referer');
  if (!referer) throw new ForbiddenError('A valid Origin header is required.');

  try {
    return new URL(referer).origin;
  } catch {
    throw new ForbiddenError('A valid Origin header is required.');
  }
}

export async function handlePublicChatRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
  bucket: string,
  handler: (input: Readonly<{ origin: string; payload: T }>) => Promise<Response>,
): Promise<Response> {
  const requestId = getRequestId(request);
  let origin: string | undefined;

  try {
    origin = getPublicRequestOrigin(request);
    await enforceTrackingRateLimit(origin, bucket);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('The chat payload must be valid JSON.');
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ValidationError('The chat payload is invalid.');

    return withRequestId(
      withAllowedOrigin(await handler({ origin, payload: parsed.data }), origin),
      requestId,
    );
  } catch (error: unknown) {
    const response = withRequestId(toHttpErrorResponse(error, requestId), requestId);
    return origin ? withAllowedOrigin(response, origin) : response;
  }
}

export async function handlePublicChatQuery<T>(
  request: Request,
  schema: z.ZodType<T>,
  bucket: string,
  handler: (input: Readonly<{ origin: string; query: T }>) => Promise<Response>,
): Promise<Response> {
  const requestId = getRequestId(request);
  let origin: string | undefined;

  try {
    origin = getPublicRequestOrigin(request);
    await enforceTrackingRateLimit(origin, bucket);

    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = schema.safeParse(query);
    if (!parsed.success) throw new ValidationError('The chat query is invalid.');

    return withRequestId(
      withAllowedOrigin(await handler({ origin, query: parsed.data }), origin),
      requestId,
    );
  } catch (error: unknown) {
    const response = withRequestId(toHttpErrorResponse(error, requestId), requestId);
    return origin ? withAllowedOrigin(response, origin) : response;
  }
}

export function publicChatResponse(response: Response, origin: string, request: Request): Response {
  return withRequestId(withAllowedOrigin(response, origin), getRequestId(request));
}
