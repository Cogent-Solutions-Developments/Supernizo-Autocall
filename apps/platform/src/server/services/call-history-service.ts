import 'server-only';

import { CallHistoryQuerySchema, type CallStatus, type CallType } from '@supernizo/shared';
import type { Prisma } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';

export type CallHistoryEntry = Readonly<{
  agentName: string | null;
  callId: string;
  durationSeconds: number | null;
  endedAt: string | null;
  failureReason: string | null;
  requestedAt: string;
  siteId: string;
  siteName: string;
  startedAt: string | null;
  status: CallStatus;
  type: CallType;
  visitorId: string;
}>;

function failureReason(status: CallStatus, failureCode: string | null): string | null {
  if (failureCode === 'RING_TIMEOUT') return 'Visitor did not answer before the ring timed out.';
  if (failureCode === 'CONNECTION_TIMEOUT') return 'The media connection did not complete in time.';
  if (status === 'MISSED') return 'The visitor did not answer.';
  if (status === 'FAILED') return 'The call could not be completed.';
  if (status === 'REJECTED') return 'The visitor declined the call.';
  if (status === 'CANCELLED') return 'The agent cancelled the call.';
  return null;
}

function mapCall(call: {
  agent: { displayName: string | null } | null;
  endedAt: Date | null;
  failureCode: string | null;
  id: string;
  requestedAt: Date;
  site: { name: string };
  siteId: string;
  startedAt: Date | null;
  status: CallStatus;
  type: CallType;
  visitorId: string;
}): CallHistoryEntry {
  const durationSeconds =
    call.startedAt && call.endedAt
      ? Math.max(0, Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1_000))
      : null;
  return {
    agentName: call.agent?.displayName ?? null,
    callId: call.id,
    durationSeconds,
    endedAt: call.endedAt?.toISOString() ?? null,
    failureReason: failureReason(call.status, call.failureCode),
    requestedAt: call.requestedAt.toISOString(),
    siteId: call.siteId,
    siteName: call.site.name,
    startedAt: call.startedAt?.toISOString() ?? null,
    status: call.status,
    type: call.type,
    visitorId: call.visitorId,
  };
}

export async function listCallHistory(siteId: string, input: unknown): Promise<CallHistoryEntry[]> {
  const parsed = CallHistoryQuerySchema.safeParse(input);
  if (!parsed.success) return [];
  const filters = parsed.data;
  const requestedAt: Prisma.DateTimeFilter = {};
  if (filters.from) requestedAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) {
    const toExclusive = new Date(`${filters.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    requestedAt.lt = toExclusive;
  }
  const calls = await getDatabaseClient().call.findMany({
    where: {
      ...(filters.agentId ? { agentId: filters.agentId } : {}),
      ...(Object.keys(requestedAt).length ? { requestedAt } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      siteId,
    },
    orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    select: {
      agent: { select: { displayName: true } },
      endedAt: true,
      failureCode: true,
      id: true,
      requestedAt: true,
      site: { select: { name: true } },
      siteId: true,
      startedAt: true,
      status: true,
      type: true,
      visitorId: true,
    },
    take: 100,
  });
  return calls.map((call) => mapCall(call));
}

export async function listVisitorCallHistory(
  siteId: string,
  visitorId: string,
): Promise<CallHistoryEntry[]> {
  const calls = await getDatabaseClient().call.findMany({
    where: { siteId, visitorId },
    orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    select: {
      agent: { select: { displayName: true } },
      endedAt: true,
      failureCode: true,
      id: true,
      requestedAt: true,
      site: { select: { name: true } },
      siteId: true,
      startedAt: true,
      status: true,
      type: true,
      visitorId: true,
    },
    take: 20,
  });
  return calls.map((call) => mapCall(call));
}

export async function listAgentsForSite(
  siteId: string,
): Promise<ReadonlyArray<Readonly<{ id: string; name: string }>>> {
  const members = await getDatabaseClient().siteMember.findMany({
    where: { role: { in: ['ADMIN', 'AGENT'] }, siteId },
    select: { user: { select: { displayName: true, email: true, id: true } } },
    orderBy: { user: { email: 'asc' } },
  });
  return members.map((member) => ({
    id: member.user.id,
    name: member.user.displayName ?? member.user.email,
  }));
}
