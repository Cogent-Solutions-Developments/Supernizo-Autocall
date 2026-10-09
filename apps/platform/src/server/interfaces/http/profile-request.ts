import 'server-only';
import { ForbiddenError, ValidationError } from '@/server/domain/errors/app-error';

export async function readProfileRequest(request: Request): Promise<unknown> {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new ForbiddenError('The request origin is invalid.');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ValidationError('The request body must be valid JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError('The request body is missing.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 370_000) {
        await reader.cancel();
        throw new ValidationError('The profile photo is too large. Choose a photo under 256 KB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new ValidationError('The request body must be valid JSON.');
  }
}
