const TRACKER_BOOTSTRAP_PATH = '/api/track/bootstrap';

function parseUrl(value: string): URL {
  const fallbackBase = typeof location === 'undefined' ? 'http://localhost' : location.href;
  return new URL(value, fallbackBase);
}

export function resolveBootstrapEndpoint(scriptSource: string): string {
  const scriptUrl = parseUrl(scriptSource);
  const sdkMarkerIndex = scriptUrl.pathname.lastIndexOf('/sdk/');
  const basePath = sdkMarkerIndex >= 0 ? scriptUrl.pathname.slice(0, sdkMarkerIndex) : '';
  scriptUrl.pathname = `${basePath}${TRACKER_BOOTSTRAP_PATH}`;
  scriptUrl.search = '';
  scriptUrl.hash = '';
  return scriptUrl.toString();
}

export function resolveApplicationEndpoint(reference: string, path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('Platform API paths must start with a slash.');
  }

  const referenceUrl = parseUrl(reference);
  const bootstrapIndex = referenceUrl.pathname.lastIndexOf(TRACKER_BOOTSTRAP_PATH);
  const basePath = bootstrapIndex >= 0 ? referenceUrl.pathname.slice(0, bootstrapIndex) : '';
  return new URL(`${basePath}${path}`, referenceUrl.origin).toString();
}
