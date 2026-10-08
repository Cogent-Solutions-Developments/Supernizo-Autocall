import 'server-only';
import { createSiteService } from '@/server/application/sites/site-service';
import { createSiteRepository } from '@/server/infrastructure/repositories/site-repository';
export * from '@/server/application/sites/site-service';
const service = createSiteService({ repository: createSiteRepository() });
export const { listSitesForUser, getSiteById, createSite, updateSite, deactivateSite } = service;
