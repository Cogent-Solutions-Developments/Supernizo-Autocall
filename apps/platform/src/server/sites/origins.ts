import 'server-only';

import { OriginInputSchema } from '@supernizo/shared';

import { ValidationError } from '@/server/errors/app-error';

export function normalizeOrigin(input: string): string {
  const parsedInput = OriginInputSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new ValidationError('An allowed origin is invalid.');
  }

  let url: URL;

  try {
    url = new URL(parsedInput.data);
  } catch {
    throw new ValidationError('An allowed origin must be a valid URL.');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new ValidationError('An allowed origin must contain only an http or https origin.');
  }

  return url.origin;
}

export function normalizeAllowedOrigins(origins: readonly string[]): string[] {
  const normalizedOrigins = origins.map(normalizeOrigin);

  return Array.from(new Set(normalizedOrigins)).sort((left, right) => left.localeCompare(right));
}

export function isOriginAllowed(
  allowedOrigins: readonly string[],
  candidateOrigin: string,
): boolean {
  try {
    const normalizedCandidate = normalizeOrigin(candidateOrigin);

    return allowedOrigins.includes(normalizedCandidate);
  } catch {
    return false;
  }
}
