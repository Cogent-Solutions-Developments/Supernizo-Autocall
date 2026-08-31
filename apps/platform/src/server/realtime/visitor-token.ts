import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getAuthenticationEnvironment } from '@/server/env';

type VisitorRealtimeClaim = Readonly<{
  channel: string;
  expiresAt: number;
}>;

function encodeClaim(claim: VisitorRealtimeClaim): string {
  return Buffer.from(JSON.stringify(claim)).toString('base64url');
}

function signature(value: string): string {
  return createHmac('sha256', getAuthenticationEnvironment().AUTH_SECRET)
    .update(value)
    .digest('base64url');
}

export function createVisitorRealtimeToken(channel: string): string {
  const payload = encodeClaim({ channel, expiresAt: Date.now() + 60 * 60 * 1_000 });
  return `${payload}.${signature(payload)}`;
}

export function verifyVisitorRealtimeToken(token: string | null): string | undefined {
  if (!token) {
    return undefined;
  }

  const [payload, suppliedSignature, unexpectedSegment] = token.split('.');
  if (!payload || !suppliedSignature || unexpectedSegment) {
    return undefined;
  }

  const expectedSignature = signature(payload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return undefined;
  }

  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    if (!claim || typeof claim !== 'object') {
      return undefined;
    }

    const typedClaim = claim as Partial<VisitorRealtimeClaim>;
    return typeof typedClaim.channel === 'string' &&
      typeof typedClaim.expiresAt === 'number' &&
      typedClaim.expiresAt > Date.now()
      ? typedClaim.channel
      : undefined;
  } catch {
    return undefined;
  }
}
