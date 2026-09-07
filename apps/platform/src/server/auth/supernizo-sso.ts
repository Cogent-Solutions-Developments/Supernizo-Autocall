import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { APP_BASE_PATH } from '@/lib/app-path';
import { getDatabaseClient } from '@/server/db/client';
import { UnauthorizedError } from '@/server/errors/app-error';

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

function httpsUrl(value: string | undefined): URL {
  const url = new URL(z.string().url().parse(value));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid SSO URL configuration.');
  }
  return url;
}

export function portalUrl(portal: string): URL {
  if (portal !== 'light' && portal !== 'heavy') throw new UnauthorizedError('Invalid portal.');
  const url = httpsUrl(
    portal === 'light' ? process.env.SUPERNIZO_LIGHT_URL : process.env.SUPERNIZO_HEAVY_URL,
  );
  url.pathname = `${url.pathname.replace(/\/$/, '')}/autocall`;
  return url;
}

export function startSupernizoSignIn(portal: string): NextResponse {
  const target = portalUrl(portal);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  target.searchParams.set('state', state);
  target.searchParams.set('challenge', createHash('sha256').update(verifier).digest('base64url'));
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(
    flowCookie,
    JSON.stringify({ state, verifier, createdAt: Date.now(), portal }),
    {
      httpOnly: true,
      secure: true,
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
  const url = httpsUrl(process.env.SUPERNIZO_BACKEND_URL);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/auth/autocall/${action}`;
  const secret = z.string().min(32).parse(process.env.SUPERNIZO_AUTOCALL_CLIENT_SECRET);
  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(4000),
    headers: { 'Content-Type': 'application/json', 'X-Autocall-Secret': secret },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new UnauthorizedError('Supernizo access is unavailable or revoked.');
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
  const user = await getDatabaseClient().user.upsert({
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
