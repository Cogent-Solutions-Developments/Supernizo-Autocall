import { lockCallParticipants } from './call-locks';
import 'server-only';
import {
  Prisma,
  type PrismaClient,
  type CallStatus as PrismaCallStatus,
} from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  CallRepository,
  CallRepositorySession,
} from '@/server/application/ports/call-repository';
const callSelect = {
  agent: { select: { displayName: true } },
  agentId: true,
  failureCode: true,
  id: true,
  requestedAt: true,
  roomName: true,
  sessionId: true,
  session: { select: { geoCity: true, geoCountry: true } },
  site: { select: { name: true, widgetAvatarUrl: true } },
  siteId: true,
  status: true,
  type: true,
  visitorInitiated: true,
  visitor: { select: { anonymousId: true } },
  visitorId: true,
} satisfies Prisma.CallSelect;

function bindRepository(getClient: () => Prisma.TransactionClient): CallRepositorySession {
  return {
    async getSiteCallSettings(siteId) {
      const database = getClient();
      return database.site.findUnique({
        where: { id: siteId },
        select: { audioCallEnabled: true, status: true, videoCallEnabled: true },
      });
    },
    async getVisitorIdentity(call) {
      const database = getClient();
      return database.visitor.findUnique({
        where: { id: call.visitorId },
        select: { anonymousId: true },
      });
    },
    async findCall(callId) {
      const database = getClient();
      return database.call.findUnique({ where: { id: callId }, select: callSelect });
    },
    async findStaleCalls(visitorId, agentId, ringingCutoff, connectionCutoff) {
      const database = getClient();
      return database.call.findMany({
        where: {
          OR: [{ visitorId }, ...(agentId ? [{ agentId }] : [])],
          AND: [
            {
              OR: [
                { requestedAt: { lte: ringingCutoff }, status: 'RINGING' },
                {
                  requestedAt: { lte: connectionCutoff },
                  status: { in: ['ACCEPTED', 'CONNECTING'] },
                },
              ],
            },
          ],
        },
        select: { id: true, status: true },
      });
    },
    async expirePendingCall(staleCall, terminalStatus) {
      const database = getClient();
      return database.call.updateMany({
        where: { id: staleCall.id, status: staleCall.status },
        data: {
          endedAt: new Date(),
          failureCode: terminalStatus === 'MISSED' ? 'RING_TIMEOUT' : 'CONNECTION_TIMEOUT',
          status: terminalStatus,
        },
      });
    },
    async recordExpiredCalls(expiredCalls) {
      const database = getClient();
      return database.callEvent.createMany({
        data: expiredCalls.map((call) => ({ callId: call.id, type: call.status })),
      });
    },
    async listCallsByIds(expiredCalls) {
      const database = getClient();
      return database.call.findMany({
        where: { id: { in: expiredCalls.map((call) => call.id) } },
        select: callSelect,
      });
    },
    async getCallExpiry(callId) {
      const database = getClient();
      return database.call.findUnique({
        where: { id: callId },
        select: { id: true, requestedAt: true, status: true },
      });
    },
    async expireRingingCall(callId) {
      const database = getClient();
      return database.call.updateMany({
        where: { id: callId, status: 'RINGING' },
        data: { endedAt: new Date(), failureCode: 'RING_TIMEOUT', status: 'MISSED' },
      });
    },
    async recordMissedCall(callId) {
      const database = getClient();
      return database.callEvent.create({ data: { callId, type: 'MISSED' } });
    },
    async findExpiredCall(callId) {
      const database = getClient();
      return database.call.findUnique({ where: { id: callId }, select: callSelect });
    },
    async findScopedVisitor(input) {
      const database = getClient();
      return database.visitor.findFirst({
        where: { id: input.visitorId, siteId: input.siteId },
        select: { anonymousId: true, id: true },
      });
    },
    async findVisitorActiveCall(terminalStatuses, input) {
      const database = getClient();
      return database.call.findFirst({
        where: { status: { notIn: terminalStatuses }, visitorId: input.visitorId },
        select: { id: true },
      });
    },
    async findAgentActiveCall(input, terminalStatuses) {
      const database = getClient();
      return database.call.findFirst({
        where: { agentId: input.agentId, status: { notIn: terminalStatuses } },
        select: { id: true },
      });
    },
    async findPresenceSession(presence) {
      const database = getClient();
      return database.session.findUnique({
        where: { anonymousSessionId: presence.sessionId },
        select: { id: true, visitorId: true },
      });
    },
    async createAgentCall(input, roomName, session) {
      const database = getClient();
      return database.call.create({
        data: {
          agentId: input.agentId,
          events: { create: { type: 'RINGING' } },
          roomName: roomName(),
          sessionId: session.id,
          siteId: input.siteId,
          type: input.type,
          visitorId: input.visitorId,
        },
        select: callSelect,
      });
    },
    async listEligibleAgents() {
      const database = getClient();
      return database.user.findMany({
        where: { supernizoId: { not: null } },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
    },
    async findRequestingVisitor(resolved) {
      const database = getClient();
      return database.visitor.findFirst({
        where: { id: resolved.visitorId, siteId: resolved.siteId },
        select: {
          anonymousId: true,
          id: true,
          identities: {
            orderBy: { linkedAt: 'desc' },
            select: { displayName: true },
            take: 1,
          },
        },
      });
    },
    async findRequestingSession(resolved) {
      const database = getClient();
      return database.session.findUnique({
        where: { id: resolved.sessionId },
        select: { geoCity: true, geoCountry: true, id: true, visitorId: true },
      });
    },
    async findPendingVisitorCall(terminalStatuses, resolved) {
      const database = getClient();
      return database.call.findFirst({
        where: { status: { notIn: terminalStatuses }, visitorId: resolved.visitorId },
        select: { id: true },
      });
    },
    async getRequestSite(resolved) {
      const database = getClient();
      return database.site.findUnique({ where: { id: resolved.siteId }, select: { name: true } });
    },
    async createVisitorCall(roomName, session, resolved, type, visitor) {
      const database = getClient();
      return database.call.create({
        data: {
          events: { create: { payload: { source: 'VISITOR_WIDGET' }, type: 'RINGING' } },
          roomName: roomName(),
          sessionId: session.id,
          siteId: resolved.siteId,
          type,
          visitorInitiated: true,
          visitorId: visitor.id,
        },
        select: callSelect,
      });
    },
    async listIncomingCalls() {
      const database = getClient();
      return database.call.findMany({
        where: { status: 'RINGING', visitorInitiated: true },
        orderBy: { requestedAt: 'desc' },
        select: callSelect,
        take: 10,
      });
    },
    async getScope(callId) {
      const database = getClient();
      return database.call.findUnique({
        where: { id: callId },
        select: { agentId: true, siteId: true },
      });
    },
    async compareAndSetStatus(existing, current, target, now, isTerminal, failureCode) {
      const database = getClient();
      return database.call.updateMany({
        where: { id: existing.id, status: current as PrismaCallStatus },
        data: {
          ...(target === 'ACCEPTED' ? { respondedAt: now } : {}),
          ...(target === 'ACTIVE' ? { startedAt: now } : {}),
          ...(isTerminal(target) ? { endedAt: now } : {}),
          ...(failureCode && (target === 'FAILED' || target === 'MISSED') ? { failureCode } : {}),
          status: target as PrismaCallStatus,
        },
      });
    },
    async recordTransition(existing, current, target) {
      const database = getClient();
      return database.callEvent.create({
        data: { callId: existing.id, payload: { from: current, to: target }, type: target },
      });
    },
    async countAgentActiveCalls(agentId, terminalStatuses) {
      const database = getClient();
      return database.call.count({
        where: { agentId, status: { notIn: terminalStatuses } },
      });
    },
    async findAgentStaleCalls(agentId, ringingCutoff, connectionCutoff) {
      const database = getClient();
      return database.call.findMany({
        where: {
          agentId,
          OR: [
            { requestedAt: { lte: ringingCutoff }, status: 'RINGING' },
            { requestedAt: { lte: connectionCutoff }, status: { in: ['ACCEPTED', 'CONNECTING'] } },
          ],
        },
        select: { id: true, status: true },
      });
    },
    async findClaimingAgentCall(agentId, terminalStatuses) {
      const database = getClient();
      return database.call.findFirst({
        where: { agentId, status: { notIn: terminalStatuses } },
        select: { id: true },
      });
    },
    async claimIncomingCall(callId, agentId) {
      const database = getClient();
      return database.call.updateMany({
        where: { agentId: null, id: callId, status: 'RINGING', visitorInitiated: true },
        data: { agentId, respondedAt: new Date(), status: 'ACCEPTED' },
      });
    },
    async recordClaim(callId) {
      const database = getClient();
      return database.callEvent.create({
        data: { callId, payload: { to: 'ACCEPTED' }, type: 'ACCEPTED' },
      });
    },
    async getClaimedCall(callId) {
      const database = getClient();
      return database.call.findUniqueOrThrow({ where: { id: callId }, select: callSelect });
    },
    async lockParticipants(agentId, visitorId) {
      const database = getClient();
      await lockCallParticipants((query) => database.$queryRaw(query), agentId, visitorId);
    },
    async lockVisitor(visitorId) {
      await getClient().$queryRaw(
        Prisma.sql`SELECT id FROM "Visitor" WHERE id = ${visitorId} FOR UPDATE`,
      );
    },
  };
}

export function createCallRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): CallRepository {
  return {
    ...bindRepository(getClient),
    transaction: (work, options) =>
      getClient().$transaction((transaction) => work(bindRepository(() => transaction)), options),
  };
}
