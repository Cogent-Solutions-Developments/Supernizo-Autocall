import 'server-only';

import { z } from 'zod';

import { ForbiddenError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';

import { enforceTrackingRateLimit } from './rate-limit';

function withAllowedOrigin(response: Response, origin: string): Response {
  response.headers.set('access-control-allow-origin', origin);
  response.headers.set('vary', 'Origin');

  return response;
}

export async function handleTrackingRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
  bucket: string,
  handler: (input: { origin: string; payload: T }) => Promise<void>,
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const origin = request.headers.get('origin');
    if (!origin) {
      throw new ForbiddenError('A valid Origin header is required.');
    }

    await enforceTrackingRateLimit(origin, bucket);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('The tracking payload must be valid JSON.');
    }

    const parsedPayload = schema.safeParse(body);
    if (!parsedPayload.success) {
      throw new ValidationError('The tracking payload is invalid.');
    }

    await handler({ origin, payload: parsedPayload.data });
    return withRequestId(withAllowedOrigin(new Response(null, { status: 204 }), origin), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
