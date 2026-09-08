import { withAppBasePath } from './app-path';

export type AppApiPath = `/api/${string}`;

export const APP_SESSION_REJECTED = 'autocall:session-rejected';

export async function fetchAppApi(path: AppApiPath, init?: RequestInit): Promise<Response> {
  const response = await fetch(withAppBasePath(path), init);
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(APP_SESSION_REJECTED));
  }
  return response;
}
