import { TrackerHeartbeatRequestSchema } from '@supernizo/shared';

import { recordTrackerHeartbeat } from '@/server/composition/tracking/tracker-engagement-service';
import { handleTrackingRequest } from '@/server/interfaces/tracking/route-handler';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  return handleTrackingRequest(
    request,
    TrackerHeartbeatRequestSchema,
    'heartbeat',
    recordTrackerHeartbeat,
  );
}
