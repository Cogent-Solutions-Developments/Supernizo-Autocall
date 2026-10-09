import type { AgentPresenceRepository } from '@/server/application/ports/agent-presence-repository';
import 'server-only';
import type { AgentAvailability } from '@supernizo/shared';
import { ConflictError } from '@/server/domain/errors/app-error';
import type {
  RuntimeProviders,
  AgentPresenceSnapshot,
} from '@/server/application/ports/runtime-providers';

export function createAgentPresenceService(
  dependencies: Pick<RuntimeProviders, 'getAgentPresenceRepository'> & {
    repository: AgentPresenceRepository;
  },
) {
  const { repository, getAgentPresenceRepository } = dependencies;
  function canAgentStartCall(availability: AgentAvailability | null): boolean {
    // A missing key is an expired heartbeat, not a durable busy lock. The call
    // transaction remains the authoritative concurrency guard in that case.
    return availability !== 'BUSY' && availability !== 'OFFLINE';
  }

  async function heartbeatAgent(
    agentId: string,
    requestedAvailability: AgentAvailability,
  ): Promise<AgentPresenceSnapshot> {
    if (requestedAvailability === 'OFFLINE') {
      return getAgentPresenceRepository().set(agentId, 'OFFLINE');
    }
    const activeCalls = await repository.countActiveCalls(agentId);
    return getAgentPresenceRepository().set(agentId, activeCalls > 0 ? 'BUSY' : 'AVAILABLE');
  }

  async function assertAgentCanStartCall(agentId: string): Promise<void> {
    const presence = await getAgentPresenceRepository().get(agentId);
    if (!canAgentStartCall(presence?.availability ?? null)) {
      throw new ConflictError(
        presence?.availability === 'OFFLINE'
          ? 'You are offline and cannot start a call.'
          : 'You are busy with another call.',
      );
    }
  }

  async function markAgentBusy(agentId: string | null): Promise<void> {
    if (agentId) await getAgentPresenceRepository().set(agentId, 'BUSY');
  }

  async function releaseAgent(agentId: string | null): Promise<void> {
    if (!agentId) return;
    const presence = await getAgentPresenceRepository().get(agentId);
    if (presence?.availability !== 'OFFLINE') {
      await getAgentPresenceRepository().set(agentId, 'AVAILABLE');
    }
  }
  return {
    canAgentStartCall,
    heartbeatAgent,
    assertAgentCanStartCall,
    markAgentBusy,
    releaseAgent,
  };
}
