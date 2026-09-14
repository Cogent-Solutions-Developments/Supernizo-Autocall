import { NextResponse } from 'next/server';

import { requireRole } from '@/server/auth/access';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { listIncomingCallsForAgent } from '@/server/services/call-service';

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
