import 'server-only';

import type { AgentAvailability } from '@supernizo/shared';

import { ConflictError } from '@/server/errors/app-error';
import { getDatabaseClient } from '@/server/db/client';
import {
  getAgentPresenceRepository,
  type AgentPresenceSnapshot,
} from '@/server/presence/agent-presence-repository';

export function canAgentStartCall(availability: AgentAvailability | null): boolean {
  // A missing key is an expired heartbeat, not a durable busy lock. The call
  // transaction remains the authoritative concurrency guard in that case.
  return availability !== 'BUSY' && availability !== 'OFFLINE';
}

export async function heartbeatAgent(
  agentId: string,
  requestedAvailability: AgentAvailability,
): Promise<AgentPresenceSnapshot> {
  if (requestedAvailability === 'OFFLINE') {
    return getAgentPresenceRepository().set(agentId, 'OFFLINE');
  }
  const activeCalls = await getDatabaseClient().call.count({
    where: {
      agentId,
      status: { notIn: ['REJECTED', 'ENDED', 'MISSED', 'FAILED', 'CANCELLED'] },
    },
  });
  return getAgentPresenceRepository().set(agentId, activeCalls > 0 ? 'BUSY' : 'AVAILABLE');
}

export async function assertAgentCanStartCall(agentId: string): Promise<void> {
  const presence = await getAgentPresenceRepository().get(agentId);
  if (!canAgentStartCall(presence?.availability ?? null)) {
    throw new ConflictError(
      presence?.availability === 'OFFLINE'
        ? 'You are offline and cannot start a call.'
        : 'You are busy with another call.',
    );
  }
}

export async function markAgentBusy(agentId: string | null): Promise<void> {
  if (agentId) await getAgentPresenceRepository().set(agentId, 'BUSY');
}

export async function releaseAgent(agentId: string | null): Promise<void> {
  if (!agentId) return;
  const presence = await getAgentPresenceRepository().get(agentId);
  if (presence?.availability !== 'OFFLINE') {
    await getAgentPresenceRepository().set(agentId, 'AVAILABLE');
  }
}
