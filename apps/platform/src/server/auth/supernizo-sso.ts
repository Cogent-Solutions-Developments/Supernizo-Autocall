import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { APP_BASE_PATH } from '@/lib/app-path';
import { getDatabaseClient } from '@/server/db/client';
import { ServiceUnavailableError, UnauthorizedError } from '@/server/errors/app-error';
import { directorySyncEnabled } from '@/server/integrations/supernizo-signature';
import { fetchDirectoryUser } from '@/server/integrations/supernizo-directory-client';
import { applyDirectoryState } from '@/server/services/supernizo-directory-service';
import {
  appendNotificationDeepLink,
  type NotificationDeepLink,
} from '@/server/auth/notification-deep-link';

const opaque = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const SupernizoIdentitySchema = z.object({
  subject: z.uuid(),
  name: z.string().min(1).max(191),
  role: z.enum(['ADMIN', 'AGENT']),
  version: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  portal: z.enum(['light', 'heavy']).optional(),
});
export type SupernizoIdentity = z.infer<typeof SupernizoIdentitySchema>;
const flowCookie = 'autocall.sso-flow';
const flowSchema = z.object({
  state: opaque,
  verifier: opaque,
  createdAt: z.number().int(),
  portal: z.enum(['light', 'heavy']),
});

export function ssoUrl(value: string | undefined): URL {
  const url = new URL(z.string().url().parse(value));
  const localHttp =
    process.env.NODE_ENV === 'development' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (!localHttp && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid SSO URL configuration.');
  }
  return url;
}

export function portalUrl(portal: string): URL {
  if (portal !== 'light' && portal !== 'heavy') throw new UnauthorizedError('Invalid portal.');
  const url = ssoUrl(
    portal === 'light' ? process.env.SUPERNIZO_LIGHT_URL : process.env.SUPERNIZO_HEAVY_URL,
  );
  url.pathname = `${url.pathname.replace(/\/$/, '')}/autocall`;
  return url;
}

export function startSupernizoSignIn(
  portal: string,
  notificationTarget: NotificationDeepLink | null = null,
): NextResponse {
  const target = portalUrl(portal);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  target.searchParams.set('state', state);
  target.searchParams.set('challenge', createHash('sha256').update(verifier).digest('base64url'));
  appendNotificationDeepLink(target, notificationTarget);
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(
    flowCookie,
    JSON.stringify({ state, verifier, createdAt: Date.now(), portal }),
    {
      httpOnly: true,
      secure: ssoUrl(process.env.APP_URL).protocol === 'https:',
      sameSite: 'lax',
      path: APP_BASE_PATH,
      maxAge: 180,
    },
  );
  return response;
}

export async function requestSupernizoIdentity(
  action: 'exchange' | 'introspect',
  payload: unknown,
): Promise<SupernizoIdentity> {
  const url = ssoUrl(process.env.SUPERNIZO_BACKEND_URL);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/auth/autocall/${action}`;
  const secret = z.string().min(32).parse(process.env.SUPERNIZO_AUTOCALL_CLIENT_SECRET);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
      headers: { 'Content-Type': 'application/json', 'X-Autocall-Secret': secret },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ServiceUnavailableError('Supernizo is temporarily unavailable. Please retry.');
  }
  if (response.status === 401 || response.status === 403)
    throw new UnauthorizedError('Supernizo session expired or access was revoked.');
  if (!response.ok)
    throw new ServiceUnavailableError('Supernizo is temporarily unavailable. Please retry.');
  const identity = SupernizoIdentitySchema.parse(await response.json());
  if (identity.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedError('Supernizo session has expired.');
  }
  return identity;
}

export async function authorizeSupernizo(credentials: unknown) {
  const input = z.object({ code: opaque, state: opaque }).safeParse(credentials);
  if (!input.success) return null;
  const jar = await cookies();
  const raw = jar.get(flowCookie)?.value;
  if (!raw) return null;
  const flow = flowSchema.parse(JSON.parse(raw));
  if (
    Date.now() - flow.createdAt > 180_000 ||
    flow.createdAt > Date.now() ||
    !timingSafeEqual(Buffer.from(input.data.state), Buffer.from(flow.state))
  )
    return null;
  const identity = await requestSupernizoIdentity('exchange', {
    code: input.data.code,
    verifier: flow.verifier,
  });
  // Never link identities by mutable email or reuse a local administrator account.
  const user = directorySyncEnabled()
    ? await provisionDirectoryIdentity(identity.subject)
    : await getDatabaseClient().user.upsert({
        where: { supernizoId: identity.subject },
        create: {
          supernizoId: identity.subject,
          email: `${identity.subject}@supernizo.invalid`,
          displayName: identity.name,
          globalRole: identity.role,
        },
        update: { displayName: identity.name, globalRole: identity.role },
        select: { id: true, email: true, displayName: true },
      });
  jar.delete({ name: flowCookie, path: APP_BASE_PATH });
  return {
    id: user.id,
    email: user.email,
    name: user.displayName,
    role: identity.role,
    supernizo: { ...identity, portal: flow.portal },
  };
}

async function provisionDirectoryIdentity(subject: string) {
  const state = await fetchDirectoryUser(subject);
  return getDatabaseClient().$transaction(async (transaction) => {
    const user = await applyDirectoryState(transaction, state);
    const eligibility = await transaction.supernizoUserState.findUniqueOrThrow({
      where: { userId: user.id },
    });
    if (eligibility.eligibility !== 'ELIGIBLE')
      throw new UnauthorizedError('Autocall access is not assigned.');
    return user;
  });
}
