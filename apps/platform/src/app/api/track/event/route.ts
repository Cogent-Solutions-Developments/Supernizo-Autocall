import { TrackerEventRequestSchema } from '@supernizo/shared';

import { recordTrackerEvent } from '@/server/composition/tracking/tracker-engagement-service';
import { handleTrackingRequest } from '@/server/interfaces/tracking/route-handler';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return handleTrackingRequest(request, TrackerEventRequestSchema, 'event', recordTrackerEvent);
}
