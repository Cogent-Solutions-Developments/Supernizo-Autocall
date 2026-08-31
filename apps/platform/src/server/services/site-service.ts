import 'server-only';

import { randomBytes } from 'node:crypto';

import {
  SiteSettingsSchema,
  type SiteCreateInput,
  type SiteSettings,
  type SiteUpdateInput,
  type StaffRole,
} from '@supernizo/shared';
import type { Prisma, PrismaClient } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { NotFoundError } from '@/server/errors/app-error';
import { normalizeAllowedOrigins } from '@/server/sites/origins';

type SiteWithSettingsFields = Awaited<ReturnType<PrismaClient['site']['findUniqueOrThrow']>>;

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

export async function listSitesForUser(userId: string, role: StaffRole): Promise<SiteSettings[]> {
  const prisma = getDatabaseClient();
  const sites = await prisma.site.findMany({
    where: role === 'ADMIN' ? {} : { members: { some: { userId } } },
    orderBy: { name: 'asc' },
  });

  return sites.map(mapSite);
}

export async function getSiteById(siteId: string): Promise<SiteSettings> {
  const prisma = getDatabaseClient();
  const site = await prisma.site.findUnique({ where: { id: siteId } });

  if (!site) {
    throw new NotFoundError('The requested site does not exist.');
  }

  return mapSite(site);
}

export async function createSite(
  actorUserId: string,
  input: SiteCreateInput,
): Promise<SiteSettings> {
  const prisma = getDatabaseClient();
  const allowedOrigins = normalizeAllowedOrigins(input.allowedOrigins);
  const site = await prisma.$transaction(async (transaction) => {
    const createdSite = await transaction.site.create({
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

    await transaction.auditLog.create({
      data: {
        action: 'site.created',
        actorUserId,
        entityId: createdSite.id,
        entityType: 'Site',
        siteId: createdSite.id,
      },
    });

    return createdSite;
  });

  return mapSite(site);
}

export async function updateSite(
  actorUserId: string,
  siteId: string,
  input: SiteUpdateInput,
): Promise<SiteSettings> {
  const prisma = getDatabaseClient();
  const existingSite = await prisma.site.findUnique({ where: { id: siteId } });

  if (!existingSite) {
    throw new NotFoundError('The requested site does not exist.');
  }

  const allowedOrigins = input.allowedOrigins
    ? normalizeAllowedOrigins(input.allowedOrigins)
    : undefined;
  const changedFields = Object.keys(input).sort();
  const updateData: Prisma.SiteUpdateInput = {};

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

  const site = await prisma.$transaction(async (transaction) => {
    const updatedSite = await transaction.site.update({
      where: { id: siteId },
      data: updateData,
    });

    await transaction.auditLog.create({
      data: {
        action: input.status === 'INACTIVE' ? 'site.disabled' : 'site.updated',
        actorUserId,
        entityId: siteId,
        entityType: 'Site',
        metadata: { changedFields },
        siteId,
      },
    });

    return updatedSite;
  });

  return mapSite(site);
}

export async function deactivateSite(actorUserId: string, siteId: string): Promise<SiteSettings> {
  return updateSite(actorUserId, siteId, { status: 'INACTIVE' });
}
