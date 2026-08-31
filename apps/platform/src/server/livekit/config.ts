import 'server-only';

import { getServerEnvironment } from '@/server/env';

export type LiveKitServerConfig = Readonly<{
  apiKey: string;
  apiSecret: string;
  url: string;
}>;

export type LiveKitPublicConfig = Readonly<{
  url: string;
}>;

export function getLiveKitServerConfig(): LiveKitServerConfig {
  const environment = getServerEnvironment();

  return {
    apiKey: environment.LIVEKIT_API_KEY,
    apiSecret: environment.LIVEKIT_API_SECRET,
    url: environment.LIVEKIT_URL,
  };
}

export function getLiveKitPublicConfig(): LiveKitPublicConfig {
  return { url: getServerEnvironment().LIVEKIT_URL };
}
