import 'server-only';

import { isIP } from 'node:net';

function normalizeIpAddress(value: string): string | null {
  const candidate = value.trim();
  const mappedIpv4 = candidate.toLowerCase().startsWith('::ffff:') ? candidate.slice(7) : candidate;

  return isIP(mappedIpv4) === 0 ? null : mappedIpv4;
}

/**
 * Reads the address set by the trusted edge. Production binds the application
 * to host loopback and Nginx overwrites X-Real-IP, so forwarded chains and
 * client-provided geolocation headers are intentionally ignored here.
 */
export function readTrustedClientIp(request: Request): string | null {
  const realIp = request.headers.get('x-real-ip');
  return realIp ? normalizeIpAddress(realIp) : null;
}
