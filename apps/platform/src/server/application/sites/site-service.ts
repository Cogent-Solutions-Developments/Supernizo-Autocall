import type { SiteRepository } from '@/server/application/ports/site-repository';
import 'server-only';
import { randomBytes } from 'node:crypto';
import {
  SiteSettingsSchema,
  type SiteCreateInput,
  type SiteSettings,
  type SiteUpdateInput,
  type StaffRole,
} from '@supernizo/shared';
import { NotFoundError } from '@/server/domain/errors/app-error';
import { normalizeAllowedOrigins } from '@/server/domain/sites/origins';

type SiteWithSettingsFields = NonNullable<Awaited<ReturnType<SiteRepository['findSite']>>>;
export function createSiteService(dependencies: { repository: SiteRepository }) {
  const { repository } = dependencies;
  function mapSite(site: SiteWithSettingsFields): SiteSettings {
    return SiteSettingsSchema.parse({
      allowedOrigins: site.allowedOrigins,
      audioCallEnabled: site.audioCallEnabled,
      chatEnabled: site.chatEnabled,
      consentMode: site.consentMode,
      createdAt: site.createdAt.toISOString(),
      eventRetentionDays: site.eventRetentionDays,
      id: site.id,
      name: site.name,
      publicKey: site.publicKey,
      status: site.status,
      trackingEnabled: site.trackingEnabled,
      updatedAt: site.updatedAt.toISOString(),
      videoCallEnabled: site.videoCallEnabled,
      widgetAvatarUrl: site.widgetAvatarUrl,
      widgetDisplayName: site.widgetDisplayName,
      widgetLogoUrl: site.widgetLogoUrl,
    });
  }

  function createPublicKey(): string {
    return `site_${randomBytes(32).toString('base64url')}`;
  }

  async function listSitesForUser(role: StaffRole): Promise<SiteSettings[]> {
    const sites = await repository.listSites(role);

    return sites.map(mapSite);
  }

  async function getSiteById(siteId: string): Promise<SiteSettings> {
    const site = await repository.findSite(siteId);

    if (!site) {
      throw new NotFoundError('The requested site does not exist.');
    }

    return mapSite(site);
  }

  async function createSite(actorUserId: string, input: SiteCreateInput): Promise<SiteSettings> {
    const allowedOrigins = normalizeAllowedOrigins(input.allowedOrigins);
    const site = await repository.transaction(async (transaction) => {
      const createdSite = await transaction.createSite(allowedOrigins, input, createPublicKey);

      await transaction.recordCreation(actorUserId, createdSite);

      return createdSite;
    });

    return mapSite(site);
  }

  async function updateSite(
    actorUserId: string,
    siteId: string,
    input: SiteUpdateInput,
  ): Promise<SiteSettings> {
    const existingSite = await repository.findSiteForUpdate(siteId);

    if (!existingSite) {
      throw new NotFoundError('The requested site does not exist.');
    }

    const allowedOrigins = input.allowedOrigins
      ? normalizeAllowedOrigins(input.allowedOrigins)
      : undefined;
    const changedFields = Object.keys(input).sort();
    const updateData: SiteUpdateInput = {};

    if (allowedOrigins) {
      updateData.allowedOrigins = allowedOrigins;
    }

    if (input.audioCallEnabled !== undefined) {
      updateData.audioCallEnabled = input.audioCallEnabled;
    }

    if (input.chatEnabled !== undefined) {
      updateData.chatEnabled = input.chatEnabled;
    }

    if (input.consentMode !== undefined) {
      updateData.consentMode = input.consentMode;
    }

    if (input.eventRetentionDays !== undefined) {
      updateData.eventRetentionDays = input.eventRetentionDays;
    }

    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    if (input.trackingEnabled !== undefined) {
      updateData.trackingEnabled = input.trackingEnabled;
    }

    if (input.videoCallEnabled !== undefined) {
      updateData.videoCallEnabled = input.videoCallEnabled;
    }

    if (input.widgetAvatarUrl !== undefined) {
      updateData.widgetAvatarUrl = input.widgetAvatarUrl;
    }

    if (input.widgetDisplayName !== undefined) {
      updateData.widgetDisplayName = input.widgetDisplayName;
    }

    if (input.widgetLogoUrl !== undefined) {
      updateData.widgetLogoUrl = input.widgetLogoUrl;
    }

    const site = await repository.transaction(async (transaction) => {
      const updatedSite = await transaction.updateSite(siteId, updateData);

      await transaction.recordUpdate(input, actorUserId, siteId, changedFields);

      return updatedSite;
    });

    return mapSite(site);
  }

  async function deactivateSite(actorUserId: string, siteId: string): Promise<SiteSettings> {
    return updateSite(actorUserId, siteId, { status: 'INACTIVE' });
  }
  return { listSitesForUser, getSiteById, createSite, updateSite, deactivateSite };
}
