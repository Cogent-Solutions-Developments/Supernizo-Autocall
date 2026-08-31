import { TrackerBootstrapRequestSchema } from '@supernizo/shared';
import { NextResponse } from 'next/server';

import { ForbiddenError, ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { bootstrapTracker } from '@/server/services/tracker-bootstrap-service';
import { enforceTrackingBootstrapRateLimit } from '@/server/tracking/rate-limit';

export const runtime = 'nodejs';

function withAllowedOrigin(response: Response, origin: string): Response {
  response.headers.set('access-control-allow-origin', origin);
  response.headers.set('vary', 'Origin');

  return response;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const origin = request.headers.get('origin');
    if (!origin) {
      throw new ForbiddenError('A valid Origin header is required.');
    }

    await enforceTrackingBootstrapRateLimit(origin);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('The tracking payload must be valid JSON.');
    }

    const parsedPayload = TrackerBootstrapRequestSchema.safeParse(body);
    if (!parsedPayload.success) {
      throw new ValidationError('The tracking payload is invalid.');
    }

    const response = await bootstrapTracker({ origin, payload: parsedPayload.data, request });
    return withRequestId(withAllowedOrigin(NextResponse.json(response), origin), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
