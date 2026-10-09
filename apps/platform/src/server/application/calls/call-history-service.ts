import type { CallHistoryRepository } from '@/server/application/ports/call-history-repository';
import 'server-only';
import { CallHistoryQuerySchema, type CallStatus, type CallType } from '@supernizo/shared';

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
export function createCallHistoryService(dependencies: { repository: CallHistoryRepository }) {
  const { repository } = dependencies;
  function getCallFailureReason(status: CallStatus, failureCode: string | null): string | null {
    if (failureCode === 'RING_TIMEOUT') return 'Visitor did not answer before the ring timed out.';
    if (failureCode === 'CONNECTION_TIMEOUT')
      return 'The media connection did not complete in time.';
    if (failureCode === 'MEDIA_CONNECTION_ABORTED') {
      return 'The browser could not establish the media connection.';
    }
    if (failureCode === 'MEDIA_CAMERA_PERMISSION_DENIED') {
      return 'The visitor did not grant camera access.';
    }
    if (failureCode === 'MEDIA_MICROPHONE_PERMISSION_DENIED') {
      return 'The visitor did not grant microphone access.';
    }
    if (failureCode === 'MEDIA_DEVICE_UNAVAILABLE') {
      return 'A required camera or microphone was unavailable.';
    }
    if (failureCode === 'MEDIA_PARTICIPANT_LEFT') {
      return 'A participant left before the media connection was ready.';
    }
    if (failureCode === 'MEDIA_ROOM_FINISHED') {
      return 'The media room closed before the call connected.';
    }
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
      failureReason: getCallFailureReason(call.status, call.failureCode),
      requestedAt: call.requestedAt.toISOString(),
      siteId: call.siteId,
      siteName: call.site.name,
      startedAt: call.startedAt?.toISOString() ?? null,
      status: call.status,
      type: call.type,
      visitorId: call.visitorId,
    };
  }

  async function listCallHistory(siteId: string, input: unknown): Promise<CallHistoryEntry[]> {
    const parsed = CallHistoryQuerySchema.safeParse(input);
    if (!parsed.success) return [];
    const filters = parsed.data;
    const requestedAt: { gte?: Date; lt?: Date; equals?: Date } = {};
    if (filters.from) requestedAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
    if (filters.to) {
      const toExclusive = new Date(`${filters.to}T00:00:00.000Z`);
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
      requestedAt.lt = toExclusive;
    }
    const calls = await repository.listHistory(filters, requestedAt, siteId);
    return calls.map((call) => mapCall(call));
  }

  async function listVisitorCallHistory(
    siteId: string,
    visitorId: string,
  ): Promise<CallHistoryEntry[]> {
    const calls = await repository.listVisitorHistory(siteId, visitorId);
    return calls.map((call) => mapCall(call));
  }

  async function listAgentsForSite(
    siteId: string,
  ): Promise<ReadonlyArray<Readonly<{ id: string; name: string }>>> {
    const users = await repository.listHistoricalAgents(siteId);
    return users.map((user) => ({
      id: user.id,
      name: user.displayName ?? user.email,
    }));
  }
  return { getCallFailureReason, listCallHistory, listVisitorCallHistory, listAgentsForSite };
}
