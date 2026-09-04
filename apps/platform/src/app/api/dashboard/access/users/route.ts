import { NextResponse } from 'next/server';

import { ManagedUserCreateSchema } from '@supernizo/shared';

import { requireRole } from '@/server/auth/access';
import { ValidationError } from '@/server/errors/app-error';
import { toHttpErrorResponse } from '@/server/http/error-response';
import { getRequestId, withRequestId } from '@/server/http/request-id';
import { createManagedUser } from '@/server/services/access-management-service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const actor = await requireRole('ADMIN');
    const body: unknown = await request.json().catch(() => {
      throw new ValidationError('The access request must be valid JSON.');
    });
    const parsed = ManagedUserCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('The user access settings are invalid.');
    }

    const user = await createManagedUser(actor.id, parsed.data);
    return withRequestId(NextResponse.json({ data: user, requestId }, { status: 201 }), requestId);
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
