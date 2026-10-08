import 'server-only';
import { createCallService } from '@/server/application/calls/call-service';
import { runtimeProviders } from '@/server/composition/runtime-providers';
import { createCallRepository } from '@/server/infrastructure/repositories/call-repository';
import { assertAgentCanStartCall } from '@/server/composition/presence/agent-presence-service';
import { markAgentBusy } from '@/server/composition/presence/agent-presence-service';
import { releaseAgent } from '@/server/composition/presence/agent-presence-service';
import { createIncomingCallNotification } from '@/server/composition/notifications/notification-service';
import { resolveTrackingContext } from '@/server/composition/tracking/tracker-engagement-service';
export * from '@/server/application/calls/call-service';
const service = createCallService({
  ...runtimeProviders,
  repository: createCallRepository(),
  assertAgentCanStartCall: (...args) => assertAgentCanStartCall(...args),
  markAgentBusy: (...args) => markAgentBusy(...args),
  releaseAgent: (...args) => releaseAgent(...args),
  createIncomingCallNotification: (...args) => createIncomingCallNotification(...args),
  resolveTrackingContext: (...args) => resolveTrackingContext(...args),
});
export const {
  getRingTimeoutSeconds,
  getConnectionTimeoutSeconds,
  isRingingCallExpired,
  transitionCallStatus,
  staleCallAction,
  visitorTerminationAction,
  visitorLocationLabel,
  runOrScheduleCallOperationalSync,
  runOrScheduleCreatedCallOperationalSync,
  createCall,
  requestVisitorCall,
  getCall,
  listIncomingCallsForAgent,
  getCallScope,
  transitionCall,
  reconcileStaleCallsForAgent,
  acceptVisitorCall,
  claimIncomingCall,
  rejectVisitorCall,
  endVisitorCall,
  failVisitorCall,
} = service;
