import { requireRole } from '@/server/auth/access';
import { ForbiddenError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    await requireRole('ADMIN');
    throw new ForbiddenError('User management is handled in Supernizo.');
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
