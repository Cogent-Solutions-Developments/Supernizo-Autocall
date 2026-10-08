import type { StaffRole } from '@supernizo/shared';
import type { JsonValue } from './json-value';
export type FindDirectoryUserResult = null | {
  supernizoState: null | {
    directoryRevision: bigint;
    eligibility: string;
    userId: string;
    sourceChangedAt: Date;
    lastSyncedAt: Date;
    stateHash: string;
  };
  id: string;
  createdAt: Date;
  updatedAt: Date;
  supernizoId: null | string;
  email: string;
  displayName: null | string;
  passwordHash: null | string;
  globalRole: StaffRole;
};

export type SaveDirectoryUserResult = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  supernizoId: null | string;
  email: string;
  displayName: null | string;
  passwordHash: null | string;
  globalRole: StaffRole;
};

export type SaveDirectoryStateResult = {
  directoryRevision: bigint;
  eligibility: string;
  userId: string;
  sourceChangedAt: Date;
  lastSyncedAt: Date;
  stateHash: string;
};

export type RecordSynchronizationResult = {
  id: string;
  siteId: null | string;
  createdAt: Date;
  metadata: JsonValue;
  action: string;
  entityType: string;
  entityId: null | string;
  actorUserId: null | string;
};

export type FindReceiptResult = null | {
  subject: string;
  eventId: string;
  payloadHash: string;
  processedAt: Date;
};

export type SaveReceiptResult = {
  subject: string;
  eventId: string;
  payloadHash: string;
  processedAt: Date;
};

export interface SupernizoDirectoryRepositorySession {
  getEligibility(userId: string): Promise<{ eligibility: string }>;
  listAccounts(
    cursor: string | undefined,
  ): Promise<Array<{ id: string; supernizoId: string | null }>>;
  findDirectoryUser(state: {
    subject: string;
    directoryRevision: string;
    changedAt: string;
    user: {
      displayName: string;
      role: StaffRole;
      eligibility: 'ELIGIBLE' | 'REVOKED' | 'DISABLED' | 'DELETED';
    };
  }): Promise<FindDirectoryUserResult>;
  findConflictingAccount(state: {
    subject: string;
    directoryRevision: string;
    changedAt: string;
    user: {
      displayName: string;
      role: StaffRole;
      eligibility: 'ELIGIBLE' | 'REVOKED' | 'DISABLED' | 'DELETED';
    };
  }): Promise<null | { id: string }>;
  saveDirectoryUser(state: {
    subject: string;
    directoryRevision: string;
    changedAt: string;
    user: {
      displayName: string;
      role: StaffRole;
      eligibility: 'ELIGIBLE' | 'REVOKED' | 'DISABLED' | 'DELETED';
    };
  }): Promise<SaveDirectoryUserResult>;
  saveDirectoryState(
    user: {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      supernizoId: null | string;
      email: string;
      displayName: null | string;
      passwordHash: null | string;
      globalRole: StaffRole;
    },
    data: {
      eligibility: 'ELIGIBLE' | 'REVOKED' | 'DISABLED' | 'DELETED';
      directoryRevision: bigint;
      sourceChangedAt: Date;
      lastSyncedAt: Date;
      stateHash: string;
    },
  ): Promise<SaveDirectoryStateResult>;
  recordSynchronization(
    user: {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      supernizoId: null | string;
      email: string;
      displayName: null | string;
      passwordHash: null | string;
      globalRole: StaffRole;
    },
    state: {
      subject: string;
      directoryRevision: string;
      changedAt: string;
      user: {
        displayName: string;
        role: StaffRole;
        eligibility: 'ELIGIBLE' | 'REVOKED' | 'DISABLED' | 'DELETED';
      };
    },
  ): Promise<RecordSynchronizationResult>;
  findReceipt(event: {
    subject: string;
    directoryRevision: string;
    changedAt: string;
    user: {
      displayName: string;
      role: StaffRole;
      eligibility: 'ELIGIBLE' | 'REVOKED' | 'DISABLED' | 'DELETED';
    };
    eventId: string;
    schemaVersion: 1;
  }): Promise<FindReceiptResult>;
  saveReceipt(
    event: {
      subject: string;
      directoryRevision: string;
      changedAt: string;
      user: {
        displayName: string;
        role: StaffRole;
        eligibility: 'ELIGIBLE' | 'REVOKED' | 'DISABLED' | 'DELETED';
      };
      eventId: string;
      schemaVersion: 1;
    },
    payloadHash: string,
  ): Promise<SaveReceiptResult>;
  lockUser(subject: string): Promise<void>;
  lockEvent(eventId: string): Promise<void>;
  pruneReceipts(): Promise<void>;
}
export interface SupernizoDirectoryRepository extends SupernizoDirectoryRepositorySession {
  transaction<T>(
    work: (transaction: SupernizoDirectoryRepositorySession) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}
