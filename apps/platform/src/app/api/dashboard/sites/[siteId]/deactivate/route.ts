import { NextResponse } from 'next/server';

import { IdSchema } from '@supernizo/shared';

import { requireRole } from '@/server/auth/access';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { deactivateSite } from '@/server/services/site-service';

type SiteRouteContext = Readonly<{
  params: Promise<{
    siteId: string;
  }>;
}>;

export const runtime = 'nodejs';

export async function POST(request: Request, context: SiteRouteContext): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const { siteId: rawSiteId } = await context.params;
    const parsedSiteId = IdSchema.safeParse(rawSiteId);

    if (!parsedSiteId.success) {
      throw new ValidationError('The site identifier is invalid.');
    }

    const user = await requireRole('ADMIN');
    const site = await deactivateSite(user.id, parsedSiteId.data);

    return withRequestId(NextResponse.json({ data: site, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
