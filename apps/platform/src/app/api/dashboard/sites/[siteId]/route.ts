import { NextResponse } from 'next/server';

import { IdSchema, SiteUpdateSchema } from '@supernizo/shared';

import { requireRole, requireSiteAccess } from '@/server/auth/access';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { getSiteById, updateSite } from '@/server/services/site-service';

type SiteRouteContext = Readonly<{
  params: Promise<{
    siteId: string;
  }>;
}>;

export const runtime = 'nodejs';

export async function GET(request: Request, context: SiteRouteContext): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const { siteId: rawSiteId } = await context.params;
    const parsedSiteId = IdSchema.safeParse(rawSiteId);

    if (!parsedSiteId.success) {
      throw new ValidationError('The site identifier is invalid.');
    }

    await requireSiteAccess(parsedSiteId.data);
    const site = await getSiteById(parsedSiteId.data);

    return withRequestId(NextResponse.json({ data: site, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}

export async function PATCH(request: Request, context: SiteRouteContext): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const [body, { siteId: rawSiteId }] = await Promise.all([
      request.json().catch(() => {
        throw new ValidationError('The request body must be valid JSON.');
      }),
      context.params,
    ]);
    const parsedSiteId = IdSchema.safeParse(rawSiteId);
    const parsedBody = SiteUpdateSchema.safeParse(body);

    if (!parsedSiteId.success || !parsedBody.success) {
      throw new ValidationError('The site update is invalid.');
    }

    const user = await requireRole('ADMIN');
    const site = await updateSite(user.id, parsedSiteId.data, parsedBody.data);

    return withRequestId(NextResponse.json({ data: site, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
