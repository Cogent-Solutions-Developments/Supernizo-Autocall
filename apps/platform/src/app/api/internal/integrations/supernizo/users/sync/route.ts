import { NextResponse } from 'next/server';
import { DirectoryEventSchema } from '@/server/domain/directory/supernizo-contract';
import {
  directorySyncEnabled,
  readDirectoryBody,
  verifyDirectorySignature,
} from '@/server/infrastructure/integrations/supernizo-signature';
import { ServiceUnavailableError, ValidationError } from '@/server/domain/errors/app-error';
import { synchronizeDirectoryEvent } from '@/server/composition/directory/supernizo-directory-service';
import { toHttpErrorResponse } from '@/server/interfaces/http/error-response';
import { getRequestId, withRequestId } from '@/server/interfaces/http/request-id';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  try {
    if (!directorySyncEnabled())
      throw new ServiceUnavailableError('Directory synchronization is disabled.');
    const body = await readDirectoryBody(request);
    verifyDirectorySignature(request.headers, body);
    const parsed = DirectoryEventSchema.safeParse(JSON.parse(body) as unknown);
    if (!parsed.success) throw new ValidationError('Invalid directory event.');
    const outcome = await synchronizeDirectoryEvent(parsed.data);
    return withRequestId(
      NextResponse.json(
        { data: { eventId: parsed.data.eventId, outcome }, requestId },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
      requestId,
    );
  } catch (error: unknown) {
    const mapped =
      error instanceof SyntaxError ? new ValidationError('Invalid JSON payload.') : error;
    return withRequestId(toHttpErrorResponse(mapped, requestId), requestId);
  }
}
