import 'server-only';
import {
  CHAT_CONTACT_CONSENT_VERSION,
  ChatContactInputSchema,
  ChatFollowUpSchema,
  type ChatFollowUp,
  type ChatFollowUpStatus,
  type ChatContactPrompt,
  type TrackingContext,
} from '@supernizo/shared';
import type { ChatContactRepository } from '@/server/application/ports/chat-contact-repository';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';
import type { createTrackerEngagementService } from '../tracking/tracker-engagement-service';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ServiceUnavailableError,
} from '@/server/domain/errors/app-error';
export function createChatContactService(dependencies: {
  repository: ChatContactRepository;
  resolveTrackingContext: ReturnType<
    typeof createTrackerEngagementService
  >['resolveTrackingContext'];
  getAgentPresenceRepository: RuntimeProviders['getAgentPresenceRepository'];
  now?: () => Date;
}) {
  const { repository, resolveTrackingContext, getAgentPresenceRepository } = dependencies;
  async function resolve(origin: string, context: TrackingContext) {
    const scope = await resolveTrackingContext(context, origin);
    const site = await repository.getSite(scope.siteId);
    if (!site || site.status !== 'ACTIVE' || !site.chatEnabled)
      throw new ForbiddenError('Chat is not available.');
    return scope;
  }
  async function getVisitorContactPrompt(
    origin: string,
    context: TrackingContext,
  ): Promise<ChatContactPrompt> {
    const scope = await resolve(origin, context);
    const saved = await repository.hasSavedContact(scope);
    let available: boolean | null = null;
    try {
      const agents = await repository.listEligibleAgentIds();
      const presence = await Promise.all(agents.map((id) => getAgentPresenceRepository().get(id)));
      available = presence.some((agent) => agent?.availability === 'AVAILABLE');
    } catch {
      // Unknown availability must not block contact capture or imply staff are online.
    }
    return { available, saved };
  }
  async function saveVisitorContact(
    origin: string,
    context: TrackingContext,
    threadId: string | undefined,
    input: unknown,
  ): Promise<{ saved: true }> {
    const contact = ChatContactInputSchema.safeParse(input);
    if (!contact.success)
      throw new ValidationError('Enter valid contact details and agree to conversation follow-up.');
    const scope = await resolve(origin, context);
    if (threadId) {
      const thread = await repository.getThread(threadId);
      if (!thread || thread.siteId !== scope.siteId || thread.visitorId !== scope.visitorId)
        throw new ForbiddenError('The chat is not available to this visitor.');
    }
    try {
      await repository.saveContact(scope, threadId, {
        contactChannel: contact.data.channel,
        contactEmail: 'email' in contact.data ? contact.data.email : null,
        contactWhatsApp: 'whatsapp' in contact.data ? contact.data.whatsapp : null,
        contactConsentAt: dependencies.now?.() ?? new Date(),
        contactConsentVersion: CHAT_CONTACT_CONSENT_VERSION,
      });
    } catch {
      // ORM errors may contain submitted values; never pass them to public error logging.
      throw new ServiceUnavailableError('Contact details could not be saved. Please try again.');
    }
    return { saved: true };
  }
  async function getChatFollowUp(threadId: string): Promise<ChatFollowUp> {
    const thread = await repository.getThread(threadId);
    if (!thread) throw new NotFoundError('The chat does not exist.');
    return ChatFollowUpSchema.parse({
      status: thread.followUpStatus,
      contact:
        thread.contactConsentAt && thread.contactChannel
          ? {
              channel: thread.contactChannel,
              email: thread.contactEmail,
              whatsapp: thread.contactWhatsApp,
              consentAt: thread.contactConsentAt.toISOString(),
              consentVersion: thread.contactConsentVersion,
            }
          : null,
    });
  }
  async function updateChatFollowUp(
    threadId: string,
    status: ChatFollowUpStatus,
  ): Promise<ChatFollowUp> {
    const current = await getChatFollowUp(threadId);
    if (status === 'FOLLOW_UP_PENDING' && !current.contact)
      throw new ValidationError('The visitor has not shared contact details.');
    await repository.setStatus(threadId, status);
    return getChatFollowUp(threadId);
  }
  return { getVisitorContactPrompt, saveVisitorContact, getChatFollowUp, updateChatFollowUp };
}
