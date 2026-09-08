import 'server-only';

import { DirectoryStateSchema } from './supernizo-contract';
import { directorySecret, signDirectoryRequest } from './supernizo-signature';
import { ServiceUnavailableError, ForbiddenError } from '@/server/errors/app-error';

export async function fetchDirectoryUser(subject: string) {
  const parsedSubject = DirectoryStateSchema.shape.subject.parse(subject);
  const base = new URL(process.env.SUPERNIZO_BACKEND_URL ?? '');
  const local =
    process.env.NODE_ENV === 'development' &&
    base.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (
    (!local && base.protocol !== 'https:') ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new ServiceUnavailableError('Directory synchronization is not configured.');
  base.pathname = `${base.pathname.replace(/\/$/, '')}/api/auth/autocall/directory/user`;
  const body = JSON.stringify({ subject: parsedSubject });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let response: Response;
  try {
    response = await fetch(base, {
      method: 'POST',
      body,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
      headers: {
        'content-type': 'application/json',
        'x-supernizo-timestamp': timestamp,
        'x-supernizo-signature': signDirectoryRequest(
          directorySecret(),
          timestamp,
          'POST',
          base.pathname,
          body,
        ),
      },
    });
  } catch {
    throw new ServiceUnavailableError('Supernizo directory is temporarily unavailable.');
  }
  if (response.status === 404) throw new ForbiddenError('Autocall access is not assigned.');
  if (!response.ok)
    throw new ServiceUnavailableError('Supernizo directory is temporarily unavailable.');
  const parsed = DirectoryStateSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.subject !== parsedSubject)
    throw new ServiceUnavailableError('Supernizo returned an invalid directory response.');
  return parsed.data;
}
