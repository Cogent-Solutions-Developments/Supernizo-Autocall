import { requireUser } from '@/server/auth/access';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';

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
