import { NextResponse } from 'next/server';

import { requireRole } from '@/server/interfaces/auth/access';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';
import { listIncomingCallsForAgent } from '@/server/composition/calls/call-service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    await requireRole('ADMIN', 'AGENT');
    const calls = await listIncomingCallsForAgent();
    return withRequestId(NextResponse.json({ data: { calls }, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
