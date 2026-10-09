import type { StaffRole } from '@supernizo/shared';
import type { JsonValue } from './json-value';
export type ListSitesResult = Array<{
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  name: string;
  publicKey: string;
  allowedOrigins: JsonValue;
  widgetDisplayName: null | string;
  widgetAvatarUrl: null | string;
  widgetLogoUrl: null | string;
  trackingEnabled: boolean;
  chatEnabled: boolean;
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
  consentMode: null | string;
  eventRetentionDays: null | number;
}>;

export type FindSiteResult = null | {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  name: string;
  publicKey: string;
  allowedOrigins: JsonValue;
  widgetDisplayName: null | string;
  widgetAvatarUrl: null | string;
  widgetLogoUrl: null | string;
  trackingEnabled: boolean;
  chatEnabled: boolean;
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
  consentMode: null | string;
  eventRetentionDays: null | number;
};

export type CreateSiteResult = {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  name: string;
  publicKey: string;
  allowedOrigins: JsonValue;
  widgetDisplayName: null | string;
  widgetAvatarUrl: null | string;
  widgetLogoUrl: null | string;
  trackingEnabled: boolean;
  chatEnabled: boolean;
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
  consentMode: null | string;
  eventRetentionDays: null | number;
};

export type RecordCreationResult = {
  id: string;
  siteId: null | string;
  createdAt: Date;
  metadata: JsonValue;
  action: string;
  entityType: string;
  entityId: null | string;
  actorUserId: null | string;
};

export interface SiteRepositorySession {
  listSites(role: StaffRole): Promise<ListSitesResult>;
  findSite(siteId: string): Promise<FindSiteResult>;
  createSite(
    allowedOrigins: Array<string>,
    input: {
      allowedOrigins: Array<string>;
      name: string;
      audioCallEnabled: boolean;
      chatEnabled: boolean;
      trackingEnabled: boolean;
      videoCallEnabled: boolean;
      consentMode?: undefined | null | string;
      eventRetentionDays?: undefined | null | number;
      widgetAvatarUrl?: undefined | null | string;
      widgetDisplayName?: undefined | null | string;
      widgetLogoUrl?: undefined | null | string;
    },
    createPublicKey: () => string,
  ): Promise<CreateSiteResult>;
  recordCreation(
    actorUserId: string,
    createdSite: {
      id: string;
      status: 'ACTIVE' | 'INACTIVE';
      createdAt: Date;
      updatedAt: Date;
      name: string;
      publicKey: string;
      allowedOrigins: JsonValue;
      widgetDisplayName: null | string;
      widgetAvatarUrl: null | string;
      widgetLogoUrl: null | string;
      trackingEnabled: boolean;
      chatEnabled: boolean;
      audioCallEnabled: boolean;
      videoCallEnabled: boolean;
      consentMode: null | string;
      eventRetentionDays: null | number;
    },
  ): Promise<RecordCreationResult>;
  findSiteForUpdate(siteId: string): Promise<FindSiteResult>;
  updateSite(
    siteId: string,
    updateData: {
      allowedOrigins?: undefined | Array<string>;
      consentMode?: undefined | null | string;
      eventRetentionDays?: undefined | null | number;
      name?: undefined | string;
      widgetAvatarUrl?: undefined | null | string;
      widgetDisplayName?: undefined | null | string;
      widgetLogoUrl?: undefined | null | string;
      audioCallEnabled?: undefined | false | true;
      chatEnabled?: undefined | false | true;
      trackingEnabled?: undefined | false | true;
      videoCallEnabled?: undefined | false | true;
      status?: undefined | 'ACTIVE' | 'INACTIVE';
    },
  ): Promise<CreateSiteResult>;
  recordUpdate(
    input: {
      allowedOrigins?: undefined | Array<string>;
      consentMode?: undefined | null | string;
      eventRetentionDays?: undefined | null | number;
      name?: undefined | string;
      widgetAvatarUrl?: undefined | null | string;
      widgetDisplayName?: undefined | null | string;
      widgetLogoUrl?: undefined | null | string;
      audioCallEnabled?: undefined | false | true;
      chatEnabled?: undefined | false | true;
      trackingEnabled?: undefined | false | true;
      videoCallEnabled?: undefined | false | true;
      status?: undefined | 'ACTIVE' | 'INACTIVE';
    },
    actorUserId: string,
    siteId: string,
    changedFields: Array<string>,
  ): Promise<RecordCreationResult>;
}
export interface SiteRepository extends SiteRepositorySession {
  transaction<T>(
    work: (transaction: SiteRepositorySession) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}
