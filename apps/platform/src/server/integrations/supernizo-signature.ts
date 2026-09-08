import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '@/server/errors/app-error';

export const DIRECTORY_SYNC_PATH = '/autocall-db/api/internal/integrations/supernizo/users/sync';
export const DIRECTORY_MAX_BYTES = 16_384;

export function directorySyncEnabled(): boolean {
  return process.env.SUPERNIZO_DIRECTORY_SYNC_ENABLED === 'true';
}

export function directorySecret(): string {
  const secret = process.env.SUPERNIZO_DIRECTORY_SYNC_SECRET ?? '';
  if (secret.length < 32)
    throw new ServiceUnavailableError('Directory synchronization is not configured.');
  return secret;
}

export function signDirectoryRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${method}\n${path}\n${body}`)
    .digest('hex');
}

export function verifyDirectorySignature(headers: Headers, body: string, now = Date.now()): void {
  const timestamp = headers.get('x-supernizo-timestamp') ?? '';
  const signature = headers.get('x-supernizo-signature') ?? '';
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    throw new UnauthorizedError('Invalid integration signature.');
  }
  const expected = signDirectoryRequest(
    directorySecret(),
    timestamp,
    'POST',
    DIRECTORY_SYNC_PATH,
    body,
  );
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
    throw new UnauthorizedError('Invalid integration signature.');
  }
}

export async function readDirectoryBody(request: Request): Promise<string> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json')
    throw new ValidationError('JSON is required.');
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError('A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > DIRECTORY_MAX_BYTES) {
        await reader.cancel();
        throw new ValidationError('The integration payload is too large.');
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}
