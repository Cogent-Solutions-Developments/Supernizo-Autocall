import { withAppBasePath } from './app-path';

export type AppApiPath = `/api/${string}`;

export function fetchAppApi(path: AppApiPath, init?: RequestInit): Promise<Response> {
  return fetch(withAppBasePath(path), init);
}
