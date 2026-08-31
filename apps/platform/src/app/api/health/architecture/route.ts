import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { architectureHealthService } from '@/server/services/architecture-health-service';

const ArchitectureHealthQuerySchema = z.object({
  probe: z.literal('architecture').default('architecture'),
});

export const runtime = 'nodejs';

export function GET(request: Request): Response {
  const requestId = getRequestId(request);

  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsedQuery = ArchitectureHealthQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      throw new ValidationError('The probe value is invalid.');
    }

    const result = architectureHealthService.getHealth(parsedQuery.data);

    return withRequestId(NextResponse.json({ data: result, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
