import { handleRealtimeRequest } from '@/server/realtime/realtime-request-handler';

export const runtime = 'nodejs';

type VisitorRealtimeRouteContext = Readonly<{ params: Promise<{ visitorToken: string }> }>;

export async function GET(
  request: Request,
  context: VisitorRealtimeRouteContext,
): Promise<Response> {
  const { visitorToken } = await context.params;
  return handleRealtimeRequest(request, visitorToken);
}
