import { NextResponse } from 'next/server';
import { ProfileUpdateSchema } from '@supernizo/shared';
import { requireUser } from '@/server/interfaces/auth/access';
import { getProfile, updateProfile } from '@/server/composition/profile/profile-service';
import { ValidationError } from '@/server/domain/errors/app-error';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';
import { readProfileRequest } from '@/server/interfaces/http/profile-request';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const user = await requireUser();
    return withRequestId(
      NextResponse.json(
        { data: await getProfile(user), requestId },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
      requestId,
    );
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    const user = await requireUser();
    const parsed = ProfileUpdateSchema.safeParse(await readProfileRequest(request));
    if (!parsed.success) throw new ValidationError('Enter a name and a valid profile photo.');
    return withRequestId(
      NextResponse.json(
        { data: await updateProfile(user.id, parsed.data), requestId },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
      requestId,
    );
  } catch (error: unknown) {
    return withRequestId(toHttpErrorResponse(error, requestId), requestId);
  }
}
