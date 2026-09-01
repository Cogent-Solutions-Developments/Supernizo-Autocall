import 'server-only';

import { NextResponse } from 'next/server';

import { AppError } from '@/server/errors/app-error';
import { logger } from '@/server/logging/logger';

type ErrorEnvelope = Readonly<{
  error: Readonly<{
    code: AppError['code'] | 'internal_error';
    message: string;
    requestId: string;
  }>;
}>;

function knownErrorResponse(error: AppError, requestId: string): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
    },
  };
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function toHttpErrorResponse(
  error: unknown,
  requestId: string,
): NextResponse<ErrorEnvelope> {
  if (error instanceof AppError) {
    logger.log('warn', 'request_failed', {
      errorCode: error.code,
      errorName: error.name,
      requestId,
      statusCode: error.statusCode,
    });

    return NextResponse.json(knownErrorResponse(error, requestId), { status: error.statusCode });
  }

  logger.log('error', 'request_failed', {
    errorCode: getErrorCode(error),
    errorMessage: error instanceof Error ? error.message.slice(0, 1_000) : undefined,
    errorName: error instanceof Error ? error.name : 'UnknownError',
    requestId,
    statusCode: 500,
  });

  return NextResponse.json(
    {
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
        requestId,
      },
    },
    { status: 500 },
  );
}
