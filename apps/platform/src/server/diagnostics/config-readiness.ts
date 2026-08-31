import 'server-only';

import { getEnvironmentReadiness } from '@/server/env';

export type ConfigurationReadiness = Readonly<{
  checks: ReturnType<typeof getEnvironmentReadiness>;
  ready: boolean;
}>;

export function getConfigurationReadiness(): ConfigurationReadiness {
  const checks = getEnvironmentReadiness();

  return {
    checks,
    ready: Object.values(checks).every(Boolean),
  };
}
