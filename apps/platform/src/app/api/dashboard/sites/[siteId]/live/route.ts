import { NextResponse } from 'next/server';

import { IdSchema } from '@supernizo/shared';

import { requireSiteAccess } from '@/server/auth/access';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { listLiveVisitorsForSite } from '@/server/services/live-presence-service';

type LiveVisitorsRouteContext = Readonly<{
  params: Promise<{ siteId: string }>;
}>;

export const runtime = 'nodejs';

export async function GET(request: Request, context: LiveVisitorsRouteContext): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const { siteId: rawSiteId } = await context.params;
    const parsedSiteId = IdSchema.safeParse(rawSiteId);
    if (!parsedSiteId.success) {
      throw new ValidationError('The site identifier is invalid.');
    }

    await requireSiteAccess(parsedSiteId.data);
    const visitors = await listLiveVisitorsForSite(parsedSiteId.data);
    return withRequestId(NextResponse.json({ data: visitors, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
