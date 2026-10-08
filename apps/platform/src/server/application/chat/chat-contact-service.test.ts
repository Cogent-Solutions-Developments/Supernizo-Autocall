import { describe, expect, it, vi } from 'vitest';
import { createChatContactService } from './chat-contact-service';
import type {
  ChatContactRepository,
  ContactRecord,
} from '@/server/application/ports/chat-contact-repository';
import type { AgentPresenceStore } from '@/server/application/ports/runtime-providers';
import { ForbiddenError, ValidationError } from '@/server/domain/errors/app-error';
const context = { sitePublicKey: 'public-site', visitorId: 'visitor-a', sessionId: 'session-a' };
const scope = { siteId: 'site-a', visitorId: 'visitor-a', sessionId: 'session-a' };
const record: ContactRecord & { siteId: string; visitorId: string } = {
  ...scope,
  contactChannel: null,
  contactEmail: null,
  contactWhatsApp: null,
  contactConsentAt: null,
  contactConsentVersion: null,
  followUpStatus: 'NEEDS_REPLY',
};
function setup() {
  const repository = {
    getSite: vi.fn().mockResolvedValue({ status: 'ACTIVE', chatEnabled: true }),
    getThread: vi.fn().mockResolvedValue(record),
    hasSavedContact: vi.fn().mockResolvedValue(false),
    listEligibleAgentIds: vi.fn().mockResolvedValue(['agent-a']),
    saveContact: vi.fn().mockResolvedValue('thread-a'),
    setStatus: vi.fn().mockResolvedValue(undefined),
  } satisfies ChatContactRepository;
  const presence = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
  } satisfies AgentPresenceStore;
  const resolveTrackingContext = vi.fn().mockResolvedValue(scope);
  const service = createChatContactService({
    repository,
    resolveTrackingContext,
    getAgentPresenceRepository: () => presence,
    now: () => new Date('2026-10-08T10:00:00Z'),
  });
  return { service, repository, presence, resolveTrackingContext };
}
describe('private conversation follow-up', () => {
  it('records server consent time and exposes only acknowledgement publicly', async () => {
    const { service, repository, resolveTrackingContext } = setup();
    await expect(
      service.saveVisitorContact('https://site.example', context, 'thread-a', {
        channel: 'EMAIL',
        email: 'person@example.com',
        consent: true,
      }),
    ).resolves.toEqual({ saved: true });
    expect(resolveTrackingContext).toHaveBeenCalledWith(context, 'https://site.example');
    expect(repository.saveContact).toHaveBeenCalledWith(scope, 'thread-a', {
      contactChannel: 'EMAIL',
      contactEmail: 'person@example.com',
      contactWhatsApp: null,
      contactConsentAt: new Date('2026-10-08T10:00:00Z'),
      contactConsentVersion: 'conversation-follow-up-v1',
    });
  });
  it.each([{ visitorId: 'another-visitor' }, { siteId: 'another-site' }])(
    'rejects a thread outside the tracking context',
    async (other) => {
      const { service, repository } = setup();
      repository.getThread.mockResolvedValue({ ...record, ...other });
      await expect(
        service.saveVisitorContact('https://site.example', context, 'thread-a', {
          channel: 'EMAIL',
          email: 'person@example.com',
          consent: true,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.saveContact).not.toHaveBeenCalled();
    },
  );
  it('masks persistence errors containing contact values', async () => {
    const { service, repository } = setup();
    repository.saveContact.mockRejectedValue(new Error('Invalid data person@example.com'));
    await expect(
      service.saveVisitorContact('https://site.example', context, undefined, {
        channel: 'EMAIL',
        email: 'person@example.com',
        consent: true,
      }),
    ).rejects.toThrow('Contact details could not be saved. Please try again.');
  });
  it('rejects missing consent before persisting', async () => {
    const { service, repository } = setup();
    await expect(
      service.saveVisitorContact('https://site.example', context, undefined, {
        channel: 'EMAIL',
        email: 'person@example.com',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.saveContact).not.toHaveBeenCalled();
  });
  it('rejects disabled chat and invalid tracking access', async () => {
    const { service, repository, resolveTrackingContext } = setup();
    repository.getSite.mockResolvedValue({ status: 'INACTIVE', chatEnabled: true });
    await expect(
      service.getVisitorContactPrompt('https://site.example', context),
    ).rejects.toBeInstanceOf(ForbiddenError);
    resolveTrackingContext.mockRejectedValue(new ForbiddenError('Origin denied'));
    await expect(
      service.saveVisitorContact('https://wrong.example', context, undefined, {
        channel: 'EMAIL',
        email: 'person@example.com',
        consent: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.saveContact).not.toHaveBeenCalled();
  });
  it('distinguishes offline staff from unknown provider availability', async () => {
    const { service, presence } = setup();
    await expect(service.getVisitorContactPrompt('https://site.example', context)).resolves.toEqual(
      { available: false, saved: false },
    );
    presence.get.mockResolvedValue({
      availability: 'AVAILABLE',
      updatedAt: new Date().toISOString(),
    });
    await expect(service.getVisitorContactPrompt('https://site.example', context)).resolves.toEqual(
      { available: true, saved: false },
    );
    presence.get.mockRejectedValue(new Error('Provider down'));
    await expect(service.getVisitorContactPrompt('https://site.example', context)).resolves.toEqual(
      { available: null, saved: false },
    );
  });
  it('does not mark external follow-up pending without consented contact', async () => {
    const { service, repository } = setup();
    await expect(
      service.updateChatFollowUp('thread-a', 'FOLLOW_UP_PENDING'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.setStatus).not.toHaveBeenCalled();
  });
});
