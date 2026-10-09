import { describe, expect, it } from 'vitest';
import { getLocalSignInError } from './local-sign-in';

const origin = 'http://localhost:3001';
const success = { ok: true, status: 200, error: null, url: origin + '/autocall-db/dashboard' };

describe('local sign-in response', () => {
  it('accepts the dashboard callback after successful authentication', () => {
    expect(getLocalSignInError(success, origin)).toBeNull();
  });

  it('treats a CSRF redirect with HTTP 200 as a failed sign-in', () => {
    expect(
      getLocalSignInError({ ...success, url: origin + '/api/auth/signin?csrf=true' }, origin),
    ).toContain('Refresh this page');
  });

  it('rejects authentication endpoints, unexpected origins and malformed URLs', () => {
    for (const url of [
      origin + '/autocall-db/api/auth/signin',
      'https://other.example/autocall-db/dashboard',
      'http://[',
      'javascript:alert(1)',
      null,
    ]) {
      expect(getLocalSignInError({ ...success, url }, origin)).not.toBeNull();
    }
  });

  it('reports rejected credentials separately from server failures', () => {
    expect(
      getLocalSignInError(
        { ...success, ok: false, status: 401, error: 'CredentialsSignin' },
        origin,
      ),
    ).toBe('Email or password is incorrect.');
    expect(getLocalSignInError({ ...success, ok: false, status: 500 }, origin)).not.toBeNull();
    expect(getLocalSignInError(undefined, origin)).not.toBeNull();
  });
});
