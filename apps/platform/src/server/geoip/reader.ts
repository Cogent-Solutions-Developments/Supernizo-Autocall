import 'server-only';

import { AddressNotFoundError, Reader, type City, type ReaderModel } from '@maxmind/geoip2-node';

import { getGeoIpEnvironment } from '@/server/env';
import { logger, type Logger } from '@/server/logging/logger';

export type ApproximateGeo = Readonly<{
  geoCity: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
}>;

type GeoIpReader = Pick<ReaderModel, 'city'>;

type GeoIpLocatorDependencies = Readonly<{
  getDatabasePath: () => string;
  log: Logger;
  openReader: (databasePath: string) => Promise<GeoIpReader>;
}>;

const emptyGeo: ApproximateGeo = {
  geoCity: null,
  geoCountry: null,
  geoRegion: null,
};

function normalizeText(value: string | undefined, maximumLength: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maximumLength) : null;
}

function mapCityResponse(response: City): ApproximateGeo {
  return {
    geoCity: normalizeText(response.city?.names.en, 191),
    geoCountry: normalizeText(response.country?.isoCode, 2)?.toUpperCase() ?? null,
    geoRegion: normalizeText(response.subdivisions?.[0]?.names.en, 191),
  };
}

export function createGeoIpLocator(
  dependencies: GeoIpLocatorDependencies,
): (ipAddress: string) => Promise<ApproximateGeo> {
  let readerPromise: Promise<GeoIpReader> | undefined;

  async function getReader(): Promise<GeoIpReader> {
    if (!readerPromise) {
      readerPromise = dependencies.openReader(dependencies.getDatabasePath()).catch((error) => {
        readerPromise = undefined;
        throw error;
      });
    }

    return readerPromise;
  }

  return async (ipAddress: string): Promise<ApproximateGeo> => {
    try {
      return mapCityResponse((await getReader()).city(ipAddress));
    } catch (error: unknown) {
      if (!(error instanceof AddressNotFoundError)) {
        dependencies.log.log('warn', 'geoip_lookup_failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }

      return emptyGeo;
    }
  };
}

export const lookupApproximateGeo = createGeoIpLocator({
  getDatabasePath: () => getGeoIpEnvironment().GEOIP_DATABASE_PATH,
  log: logger,
  openReader: (databasePath) =>
    Reader.open(databasePath, {
      cache: { max: 10_000 },
      watchForUpdates: true,
    }),
});
