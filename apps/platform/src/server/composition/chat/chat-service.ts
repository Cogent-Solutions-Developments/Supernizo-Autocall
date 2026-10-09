import 'server-only';
import { createChatService } from '@/server/application/chat/chat-service';
import { runtimeProviders } from '@/server/composition/runtime-providers';
import { createChatRepository } from '@/server/infrastructure/repositories/chat-repository';
import { createChatMessageNotifications } from '@/server/composition/notifications/notification-service';
import { resolveTrackingContext } from '@/server/composition/tracking/tracker-engagement-service';
export * from '@/server/application/chat/chat-service';
const service = createChatService({
  ...runtimeProviders,
  repository: createChatRepository(),
  createChatMessageNotifications: (...args) => createChatMessageNotifications(...args),
  resolveTrackingContext: (...args) => resolveTrackingContext(...args),
});
export const {
  visitorOwnsChatThread,
  getChatThreadScope,
  chatThreadBelongsToVisitor,
  listChatInboxThreads,
  resolveOrCreateChatThread,
  getChatHistory,
  getVisitorChatThread,
  startVisitorChat,
  sendAgentChatMessage,
  sendVisitorChatMessage,
} = service;
