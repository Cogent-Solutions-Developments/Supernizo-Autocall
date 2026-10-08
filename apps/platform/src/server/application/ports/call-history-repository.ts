import type { CallType, CallStatus } from '@supernizo/shared';
export type ListHistoryResult = Array<{
  id: string;
  siteId: string;
  visitorId: string;
  type: CallType;
  status: CallStatus;
  requestedAt: Date;
  startedAt: null | Date;
  endedAt: null | Date;
  failureCode: null | string;
  site: { name: string };
  agent: null | { displayName: null | string };
}>;

export type ListHistoricalAgentsResult = Array<{
  id: string;
  email: string;
  displayName: null | string;
}>;

export interface CallHistoryRepositorySession {
  listHistory(
    filters: {
      agentId?: undefined | string;
      from?: undefined | string;
      siteId?: undefined | string;
      status?:
        | undefined
        | 'RINGING'
        | 'ACCEPTED'
        | 'REJECTED'
        | 'CONNECTING'
        | 'ACTIVE'
        | 'ENDED'
        | 'MISSED'
        | 'FAILED'
        | 'CANCELLED';
      to?: undefined | string;
      type?: undefined | 'AUDIO' | 'VIDEO';
    },
    requestedAt: { gte?: Date; lt?: Date },
    siteId: string,
  ): Promise<ListHistoryResult>;
  listVisitorHistory(siteId: string, visitorId: string): Promise<ListHistoryResult>;
  listHistoricalAgents(siteId: string): Promise<ListHistoricalAgentsResult>;
}
export type CallHistoryRepository = CallHistoryRepositorySession;
