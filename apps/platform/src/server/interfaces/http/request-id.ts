import 'server-only';

import { randomUUID } from 'node:crypto';

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getRequestId(request: Request): string {
  const suppliedRequestId = request.headers.get('x-request-id');

  return suppliedRequestId !== null && requestIdPattern.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();
}

export function withRequestId(response: Response, requestId: string): Response {
  response.headers.set('x-request-id', requestId);

  return response;
}
