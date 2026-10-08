import 'server-only';
import { createChatContactService } from '@/server/application/chat/chat-contact-service';
import { createChatContactRepository } from '@/server/infrastructure/repositories/chat-contact-repository';
import { resolveTrackingContext } from '@/server/composition/tracking/tracker-engagement-service';
import { runtimeProviders } from '@/server/composition/runtime-providers';
export const { getVisitorContactPrompt, saveVisitorContact, getChatFollowUp, updateChatFollowUp } =
  createChatContactService({
    repository: createChatContactRepository(),
    resolveTrackingContext,
    getAgentPresenceRepository: runtimeProviders.getAgentPresenceRepository,
  });
