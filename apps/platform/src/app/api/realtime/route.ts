import { handleRealtimeRequest } from '@/server/realtime/realtime-request-handler';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return handleRealtimeRequest(request);
}
