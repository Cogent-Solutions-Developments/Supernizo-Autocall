import { describe, expect, it } from 'vitest';

import { APP_BASE_PATH, AUTH_API_BASE_PATH, withAppBasePath } from './app-path';

describe('withAppBasePath', () => {
  it('exposes the prefixed authentication API path for browser clients', () => {
    expect(AUTH_API_BASE_PATH).toBe('/autocall-db/api/auth');
  });

  it('adds the production sub-path to an application route', () => {
    expect(withAppBasePath('/api/health/ready')).toBe('/autocall-db/api/health/ready');
  });

  it('does not duplicate an existing base path', () => {
    expect(withAppBasePath(`${APP_BASE_PATH}/dashboard`)).toBe('/autocall-db/dashboard');
  });

  it('rejects relative paths', () => {
    expect(() => withAppBasePath('dashboard')).toThrow('must start with a slash');
  });
});
