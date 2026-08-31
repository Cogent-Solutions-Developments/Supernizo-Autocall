import { TrackerEventRequestSchema } from '@supernizo/shared';

import { recordTrackerEvent } from '@/server/services/tracker-engagement-service';
import { handleTrackingRequest } from '@/server/tracking/route-handler';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return handleTrackingRequest(request, TrackerEventRequestSchema, 'event', recordTrackerEvent);
}
