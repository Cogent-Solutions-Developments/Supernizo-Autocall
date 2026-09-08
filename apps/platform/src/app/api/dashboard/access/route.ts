import { NextResponse } from 'next/server';

import { requireRole } from '@/server/auth/access';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { listAccessManagement } from '@/server/services/access-management-service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    await requireRole('ADMIN');
    const access = await listAccessManagement();
    return withRequestId(NextResponse.json({ data: access, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
