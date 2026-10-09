import 'server-only';
import { createAgentPresenceService } from '@/server/application/presence/agent-presence-service';
import { runtimeProviders } from '@/server/composition/runtime-providers';
import { createAgentPresenceRepository } from '@/server/infrastructure/repositories/agent-presence-repository';
export * from '@/server/application/presence/agent-presence-service';
const service = createAgentPresenceService({
  ...runtimeProviders,
  repository: createAgentPresenceRepository(),
});
export const {
  canAgentStartCall,
  heartbeatAgent,
  assertAgentCanStartCall,
  markAgentBusy,
  releaseAgent,
} = service;
