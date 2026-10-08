import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  SiteRepository,
  SiteRepositorySession,
} from '@/server/application/ports/site-repository';

function bindRepository(getClient: () => Prisma.TransactionClient): SiteRepositorySession {
  return {
    async listSites(role) {
      const database = getClient();
      return database.site.findMany({
        where: role === 'ADMIN' ? {} : { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      });
    },
    async findSite(siteId) {
      const database = getClient();
      return database.site.findUnique({ where: { id: siteId } });
    },
    async createSite(allowedOrigins, input, createPublicKey) {
      const database = getClient();
      return database.site.create({
        data: {
          allowedOrigins,
          audioCallEnabled: input.audioCallEnabled,
          chatEnabled: input.chatEnabled,
          consentMode: input.consentMode ?? null,
          eventRetentionDays: input.eventRetentionDays ?? null,
          name: input.name,
          publicKey: createPublicKey(),
          trackingEnabled: input.trackingEnabled,
          videoCallEnabled: input.videoCallEnabled,
          widgetAvatarUrl: input.widgetAvatarUrl ?? null,
          widgetDisplayName: input.widgetDisplayName ?? null,
          widgetLogoUrl: input.widgetLogoUrl ?? null,
        },
      });
    },
    async recordCreation(actorUserId, createdSite) {
      const database = getClient();
      return database.auditLog.create({
        data: {
          action: 'site.created',
          actorUserId,
          entityId: createdSite.id,
          entityType: 'Site',
          siteId: createdSite.id,
        },
      });
    },
    async findSiteForUpdate(siteId) {
      const database = getClient();
      return database.site.findUnique({ where: { id: siteId } });
    },
    async updateSite(siteId, updateData) {
      const database = getClient();
      return database.site.update({
        where: { id: siteId },
        data: {
          ...(updateData.allowedOrigins !== undefined
            ? { allowedOrigins: updateData.allowedOrigins }
            : {}),
          ...(updateData.audioCallEnabled !== undefined
            ? { audioCallEnabled: updateData.audioCallEnabled }
            : {}),
          ...(updateData.chatEnabled !== undefined ? { chatEnabled: updateData.chatEnabled } : {}),
          ...(updateData.consentMode !== undefined ? { consentMode: updateData.consentMode } : {}),
          ...(updateData.eventRetentionDays !== undefined
            ? { eventRetentionDays: updateData.eventRetentionDays }
            : {}),
          ...(updateData.name !== undefined ? { name: updateData.name } : {}),
          ...(updateData.status !== undefined ? { status: updateData.status } : {}),
          ...(updateData.trackingEnabled !== undefined
            ? { trackingEnabled: updateData.trackingEnabled }
            : {}),
          ...(updateData.videoCallEnabled !== undefined
            ? { videoCallEnabled: updateData.videoCallEnabled }
            : {}),
          ...(updateData.widgetAvatarUrl !== undefined
            ? { widgetAvatarUrl: updateData.widgetAvatarUrl }
            : {}),
          ...(updateData.widgetDisplayName !== undefined
            ? { widgetDisplayName: updateData.widgetDisplayName }
            : {}),
          ...(updateData.widgetLogoUrl !== undefined
            ? { widgetLogoUrl: updateData.widgetLogoUrl }
            : {}),
        },
      });
    },
    async recordUpdate(input, actorUserId, siteId, changedFields) {
      const database = getClient();
      return database.auditLog.create({
        data: {
          action: input.status === 'INACTIVE' ? 'site.disabled' : 'site.updated',
          actorUserId,
          entityId: siteId,
          entityType: 'Site',
          metadata: { changedFields },
          siteId,
        },
      });
    },
  };
}

export function createSiteRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): SiteRepository {
  return {
    ...bindRepository(getClient),
    transaction: (work, options) =>
      getClient().$transaction((transaction) => work(bindRepository(() => transaction)), options),
  };
}
