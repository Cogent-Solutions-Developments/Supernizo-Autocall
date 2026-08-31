import 'server-only';

import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const httpUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;

    return protocol === 'http:' || protocol === 'https:';
  },
  { message: 'Must use an http or https URL.' },
);
const liveKitUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;

    return protocol === 'ws:' || protocol === 'wss:';
  },
  { message: 'Must use a ws or wss URL.' },
);

const ServerEnvironmentSchema = z.object({
  APP_URL: httpUrl,
  AUTH_SECRET: nonEmptyString.min(32),
  DATABASE_URL: nonEmptyString.url(),
  LIVEKIT_API_KEY: nonEmptyString,
  LIVEKIT_API_SECRET: nonEmptyString,
  LIVEKIT_URL: liveKitUrl,
  TRACKING_IP_HASH_SECRET: nonEmptyString.min(32),
  UPSTASH_REDIS_REST_TOKEN: nonEmptyString,
  UPSTASH_REDIS_REST_URL: httpUrl,
});

const environmentKeys = [
  'APP_URL',
  'AUTH_SECRET',
  'DATABASE_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_URL',
  'TRACKING_IP_HASH_SECRET',
  'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_REST_URL',
] as const;

type EnvironmentKey = (typeof environmentKeys)[number];
type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type ServerEnvironment = z.infer<typeof ServerEnvironmentSchema>;

const DatabaseEnvironmentSchema = ServerEnvironmentSchema.pick({
  DATABASE_URL: true,
});

export type DatabaseEnvironment = z.infer<typeof DatabaseEnvironmentSchema>;

export class EnvironmentConfigurationError extends Error {
  public constructor(public readonly invalidVariables: readonly string[]) {
    super(
      `Server environment configuration is missing or invalid: ${invalidVariables.join(', ')}.`,
    );
    this.name = 'EnvironmentConfigurationError';
  }
}

export type EnvironmentReadiness = Readonly<{
  appUrl: boolean;
  auth: boolean;
  database: boolean;
  livekit: boolean;
  redis: boolean;
  realtime: boolean;
  trackingIpHash: boolean;
}>;

function invalidEnvironmentVariables(
  result: z.ZodSafeParseError<ServerEnvironment>,
): readonly string[] {
  return Array.from(
    new Set(
      result.error.issues
        .map((issue) => String(issue.path[0] ?? 'unknown'))
        .filter((variable): variable is EnvironmentKey =>
          environmentKeys.includes(variable as EnvironmentKey),
        ),
    ),
  );
}

export function getServerEnvironment(source: EnvironmentSource = process.env): ServerEnvironment {
  const result = ServerEnvironmentSchema.safeParse(source);

  if (!result.success) {
    throw new EnvironmentConfigurationError(invalidEnvironmentVariables(result));
  }

  return result.data;
}

export function getDatabaseEnvironment(
  source: EnvironmentSource = process.env,
): DatabaseEnvironment {
  const result = DatabaseEnvironmentSchema.safeParse(source);

  if (!result.success) {
    throw new EnvironmentConfigurationError(['DATABASE_URL']);
  }

  return result.data;
}

export function getEnvironmentReadiness(
  source: EnvironmentSource = process.env,
): EnvironmentReadiness {
  const result = ServerEnvironmentSchema.safeParse(source);
  const invalidVariables = result.success
    ? new Set<string>()
    : new Set(invalidEnvironmentVariables(result));
  const isValid = (key: EnvironmentKey): boolean => !invalidVariables.has(key);

  return {
    appUrl: isValid('APP_URL'),
    auth: isValid('AUTH_SECRET'),
    database: isValid('DATABASE_URL'),
    livekit: isValid('LIVEKIT_URL') && isValid('LIVEKIT_API_KEY') && isValid('LIVEKIT_API_SECRET'),
    redis: isValid('UPSTASH_REDIS_REST_URL') && isValid('UPSTASH_REDIS_REST_TOKEN'),
    realtime: isValid('UPSTASH_REDIS_REST_URL') && isValid('UPSTASH_REDIS_REST_TOKEN'),
    trackingIpHash: isValid('TRACKING_IP_HASH_SECRET'),
  };
}
