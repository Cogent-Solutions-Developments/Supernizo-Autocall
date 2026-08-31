import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/logging/logger', () => ({
  logger: { log: vi.fn() },
}));

import { NotFoundError, ValidationError } from '@/server/errors/app-error';

import { toHttpErrorResponse } from './error-response';

describe('toHttpErrorResponse', () => {
  const requestId = 'ea83fe17-031e-4e03-902c-65ad60df783d';

  it('maps known application errors to safe JSON responses', async () => {
    const response = toHttpErrorResponse(new NotFoundError('Resource was not found.'), requestId);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Resource was not found.',
        requestId,
      },
    });
  });

  it('does not leak unknown error messages', async () => {
    const response = toHttpErrorResponse(new Error('database password is exposed'), requestId);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
        requestId,
      },
    });
  });

  it('keeps validation error messages intentional and safe', async () => {
    const response = toHttpErrorResponse(
      new ValidationError('The probe value is invalid.'),
      requestId,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'validation_error', requestId },
    });
  });
});
