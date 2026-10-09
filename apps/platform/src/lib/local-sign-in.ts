import type { SignInResponse } from 'next-auth/react';

import { withAppBasePath } from './app-path';

export function getLocalSignInError(
  result: SignInResponse | undefined,
  origin: string,
): string | null {
  if (result?.error === 'CredentialsSignin') {
    return 'Email or password is incorrect.';
  }

  const failure = 'Unable to sign in. Please try again.';
  if (!result?.ok || result.error || !result.url) return failure;

  try {
    const target = new URL(result.url, origin);
    if (target.searchParams.get('csrf') === 'true') {
      return 'Your sign-in session expired. Refresh this page and try again.';
    }
    if (target.origin !== origin || target.pathname !== withAppBasePath('/dashboard')) {
      return failure;
    }
    return null;
  } catch {
    return failure;
  }
}
