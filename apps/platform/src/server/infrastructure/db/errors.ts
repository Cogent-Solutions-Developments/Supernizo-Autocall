import 'server-only';
export function isRetryableWriteError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'P2034';
}
