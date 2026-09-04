import { NextResponse } from 'next/server';

import { IdSchema, ManagedUserUpdateSchema } from '@supernizo/shared';

import { requireRole } from '@/server/auth/access';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { updateManagedUser } from '@/server/services/access-management-service';

type ManagedUserRouteContext = Readonly<{
  params: Promise<{ userId: string }>;
}>;

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: ManagedUserRouteContext): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const actor = await requireRole('ADMIN');
    const [body, { userId: rawUserId }] = await Promise.all([
      request.json().catch(() => {
        throw new ValidationError('The access request must be valid JSON.');
      }),
      context.params,
    ]);
    const userId = IdSchema.safeParse(rawUserId);
    const parsed = ManagedUserUpdateSchema.safeParse(body);
    if (!userId.success || !parsed.success) {
      throw new ValidationError('The user access settings are invalid.');
    }

    const user = await updateManagedUser(actor.id, userId.data, parsed.data);
    return withRequestId(NextResponse.json({ data: user, requestId }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
