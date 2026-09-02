export const APP_BASE_PATH = '/autocall-db' as const;
export const AUTH_API_BASE_PATH = `${APP_BASE_PATH}/api/auth` as const;

export function withAppBasePath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('Application paths must start with a slash.');
  }

  if (path === APP_BASE_PATH || path.startsWith(`${APP_BASE_PATH}/`)) {
    return path;
  }

  return `${APP_BASE_PATH}${path}`;
}
