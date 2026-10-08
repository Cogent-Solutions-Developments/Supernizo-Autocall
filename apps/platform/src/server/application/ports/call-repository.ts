import type { CallType, CallStatus } from '@supernizo/shared';
import type { JsonValue } from './json-value';
export type GetSiteCallSettingsResult = null | {
  status: 'ACTIVE' | 'INACTIVE';
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
};

export type FindCallResult = null | {
  id: string;
  siteId: string;
  visitorId: string;
  sessionId: null | string;
  agentId: null | string;
  type: CallType;
  visitorInitiated: boolean;
  status: CallStatus;
  roomName: null | string;
  requestedAt: Date;
  failureCode: null | string;
  site: { name: string; widgetAvatarUrl: null | string };
  visitor: { anonymousId: string };
  session: null | { geoCountry: null | string; geoCity: null | string };
  agent: null | { displayName: null | string };
};

export type FindStaleCallsResult = Array<{
  id: string;
  status: CallStatus;
}>;

export type ListCallsByIdsResult = Array<{
  id: string;
  siteId: string;
  visitorId: string;
  sessionId: null | string;
  agentId: null | string;
  type: CallType;
  visitorInitiated: boolean;
  status: CallStatus;
  roomName: null | string;
  requestedAt: Date;
  failureCode: null | string;
  site: { name: string; widgetAvatarUrl: null | string };
  visitor: { anonymousId: string };
  session: null | { geoCountry: null | string; geoCity: null | string };
  agent: null | { displayName: null | string };
}>;

export type GetCallExpiryResult = null | {
  id: string;
  status: CallStatus;
  requestedAt: Date;
};

export type RecordMissedCallResult = {
  id: string;
  type: string;
  createdAt: Date;
  payload: JsonValue;
  callId: string;
};

export type CreateAgentCallResult = {
  id: string;
  siteId: string;
  visitorId: string;
  sessionId: null | string;
  agentId: null | string;
  type: CallType;
  visitorInitiated: boolean;
  status: CallStatus;
  roomName: null | string;
  requestedAt: Date;
  failureCode: null | string;
  site: { name: string; widgetAvatarUrl: null | string };
  visitor: { anonymousId: string };
  session: null | { geoCountry: null | string; geoCity: null | string };
  agent: null | { displayName: null | string };
};

export type FindRequestingVisitorResult = null | {
  id: string;
  anonymousId: string;
  identities: Array<{ displayName: null | string }>;
};

export type FindRequestingSessionResult = null | {
  id: string;
  visitorId: string;
  geoCountry: null | string;
  geoCity: null | string;
};

export type GetScopeResult = null | { siteId: string; agentId: null | string };

export interface CallRepositorySession {
  getSiteCallSettings(siteId: string): Promise<GetSiteCallSettingsResult>;
  getVisitorIdentity(call: {
    agentDisplayName: null | string;
    id: string;
    requestedAt: string;
    roomName: string;
    siteId: string;
    status: CallStatus;
    type: CallType;
    visitorId: string;
    agentAvatarUrl?: undefined | null | string;
  }): Promise<null | { anonymousId: string }>;
  findCall(callId: string): Promise<FindCallResult>;
  findStaleCalls(
    visitorId: string,
    agentId: undefined | string,
    ringingCutoff: Date,
    connectionCutoff: Date,
  ): Promise<FindStaleCallsResult>;
  expirePendingCall(
    staleCall: {
      id: string;
      status: CallStatus;
    },
    terminalStatus: 'MISSED' | 'FAILED',
  ): Promise<{ count: number }>;
  recordExpiredCalls(
    expiredCalls: Array<{ id: string; status: 'MISSED' | 'FAILED' }>,
  ): Promise<{ count: number }>;
  listCallsByIds(
    expiredCalls: Array<{ id: string; status: 'MISSED' | 'FAILED' }>,
  ): Promise<ListCallsByIdsResult>;
  getCallExpiry(callId: string): Promise<GetCallExpiryResult>;
  expireRingingCall(callId: string): Promise<{ count: number }>;
  recordMissedCall(callId: string): Promise<RecordMissedCallResult>;
  findExpiredCall(callId: string): Promise<FindCallResult>;
  findScopedVisitor(input: {
    agentId: string;
    siteId: string;
    type: CallType;
    visitorId: string;
  }): Promise<null | { id: string; anonymousId: string }>;
  findVisitorActiveCall(
    terminalStatuses: Array<CallStatus>,
    input: { agentId: string; siteId: string; type: CallType; visitorId: string },
  ): Promise<null | { id: string }>;
  findAgentActiveCall(
    input: { agentId: string; siteId: string; type: CallType; visitorId: string },
    terminalStatuses: Array<CallStatus>,
  ): Promise<null | { id: string }>;
  findPresenceSession(presence: {
    activeDurationSeconds: number;
    anonymousVisitorId: string;
    browserName: null | string;
    city: null | string;
    country: null | string;
    currentUrl: null | string;
    deviceType: null | string;
    intentScore: null | number;
    lastSeenAt: string;
    returningVisitCount: number;
    sessionId: string;
    siteId: string;
    source: null | string;
    visitorId: string;
  }): Promise<null | { id: string; visitorId: string }>;
  createAgentCall(
    input: { agentId: string; siteId: string; type: CallType; visitorId: string },
    roomName: () => string,
    session: { id: string; visitorId: string },
  ): Promise<CreateAgentCallResult>;
  listEligibleAgents(): Promise<Array<{ id: string }>>;
  findRequestingVisitor(resolved: {
    sessionId: string;
    siteId: string;
    visitorId: string;
  }): Promise<FindRequestingVisitorResult>;
  findRequestingSession(resolved: {
    sessionId: string;
    siteId: string;
    visitorId: string;
  }): Promise<FindRequestingSessionResult>;
  findPendingVisitorCall(
    terminalStatuses: Array<CallStatus>,
    resolved: { sessionId: string; siteId: string; visitorId: string },
  ): Promise<null | { id: string }>;
  getRequestSite(resolved: {
    sessionId: string;
    siteId: string;
    visitorId: string;
  }): Promise<null | { name: string }>;
  createVisitorCall(
    roomName: () => string,
    session: { id: string; visitorId: string; geoCountry: null | string; geoCity: null | string },
    resolved: { sessionId: string; siteId: string; visitorId: string },
    type: CallType,
    visitor: { id: string; anonymousId: string; identities: Array<{ displayName: null | string }> },
  ): Promise<CreateAgentCallResult>;
  listIncomingCalls(): Promise<ListCallsByIdsResult>;
  getScope(callId: string): Promise<GetScopeResult>;
  compareAndSetStatus(
    existing: {
      id: string;
      siteId: string;
      visitorId: string;
      sessionId: null | string;
      agentId: null | string;
      type: CallType;
      visitorInitiated: boolean;
      status: CallStatus;
      roomName: null | string;
      requestedAt: Date;
      failureCode: null | string;
      site: { name: string; widgetAvatarUrl: null | string };
      visitor: { anonymousId: string };
      session: null | { geoCountry: null | string; geoCity: null | string };
      agent: null | { displayName: null | string };
    },
    current: CallStatus,
    target: CallStatus,
    now: Date,
    isTerminal: (status: CallStatus) => boolean,
    failureCode: undefined | string,
  ): Promise<{ count: number }>;
  recordTransition(
    existing: {
      id: string;
      siteId: string;
      visitorId: string;
      sessionId: null | string;
      agentId: null | string;
      type: CallType;
      visitorInitiated: boolean;
      status: CallStatus;
      roomName: null | string;
      requestedAt: Date;
      failureCode: null | string;
      site: { name: string; widgetAvatarUrl: null | string };
      visitor: { anonymousId: string };
      session: null | { geoCountry: null | string; geoCity: null | string };
      agent: null | { displayName: null | string };
    },
    current: CallStatus,
    target: CallStatus,
  ): Promise<RecordMissedCallResult>;
  countAgentActiveCalls(agentId: string, terminalStatuses: Array<CallStatus>): Promise<number>;
  findAgentStaleCalls(
    agentId: string,
    ringingCutoff: Date,
    connectionCutoff: Date,
  ): Promise<FindStaleCallsResult>;
  findClaimingAgentCall(
    agentId: string,
    terminalStatuses: Array<CallStatus>,
  ): Promise<null | { id: string }>;
  claimIncomingCall(callId: string, agentId: string): Promise<{ count: number }>;
  recordClaim(callId: string): Promise<RecordMissedCallResult>;
  getClaimedCall(callId: string): Promise<CreateAgentCallResult>;
  lockParticipants(agentId: string, visitorId: string): Promise<void>;
  lockVisitor(visitorId: string): Promise<void>;
}
export interface CallRepository extends CallRepositorySession {
  transaction<T>(
    work: (transaction: CallRepositorySession) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}
