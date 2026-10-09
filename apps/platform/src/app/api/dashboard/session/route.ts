import { requireUser } from '@/server/interfaces/auth/access';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  let response: Response;
  try {
    await requireUser();
    response = new Response(null, { status: 204 });
  } catch (error: unknown) {
    response = toHttpErrorResponse(error, requestId);
  }
  response.headers.set('Cache-Control', 'no-store');
  return withRequestId(response, requestId);
}
