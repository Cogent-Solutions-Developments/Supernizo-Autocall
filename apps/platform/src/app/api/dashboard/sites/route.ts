import { NextResponse } from 'next/server';

import { SiteCreateSchema } from '@supernizo/shared';

import { requireRole, requireUser } from '@/server/auth/access';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { createSite, listSitesForUser } from '@/server/services/site-service';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const user = await requireUser();
    const sites = await listSitesForUser(user.id, user.role);

    return withRequestId(NextResponse.json({ data: sites, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const body: unknown = await request.json().catch(() => {
      throw new ValidationError('The request body must be valid JSON.');
    });
    const parsedBody = SiteCreateSchema.safeParse(body);

    if (!parsedBody.success) {
      throw new ValidationError('The site settings are invalid.');
    }

    const user = await requireRole('ADMIN');
    const site = await createSite(user.id, parsedBody.data);

    return withRequestId(NextResponse.json({ data: site, requestId }, { status: 201 }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
