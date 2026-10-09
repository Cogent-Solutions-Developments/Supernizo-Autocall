import { requireRole } from '@/server/interfaces/auth/access';
import { ForbiddenError } from '@/server/domain/errors/app-error';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    await requireRole('ADMIN');
    throw new ForbiddenError(
      'Event assignments have been removed. Users with Autocall access can access all active events.',
    );
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
