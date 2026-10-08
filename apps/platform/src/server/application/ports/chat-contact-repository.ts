import type { ChatFollowUpStatus } from '@supernizo/shared';
export type ContactScope = Readonly<{ siteId: string; visitorId: string; sessionId: string }>;
export type ContactRecord = Readonly<{
  contactChannel: 'EMAIL' | 'WHATSAPP' | 'BOTH' | null;
  contactEmail: string | null;
  contactWhatsApp: string | null;
  contactConsentAt: Date | null;
  contactConsentVersion: string | null;
  followUpStatus: ChatFollowUpStatus;
}>;
export interface ChatContactRepository {
  getSite(siteId: string): Promise<{ status: string; chatEnabled: boolean } | null>;
  getThread(
    threadId: string,
  ): Promise<(ContactRecord & { siteId: string; visitorId: string }) | null>;
  hasSavedContact(scope: ContactScope): Promise<boolean>;
  listEligibleAgentIds(): Promise<string[]>;
  saveContact(
    scope: ContactScope,
    threadId: string | undefined,
    contact: Omit<ContactRecord, 'followUpStatus'>,
  ): Promise<string>;
  setStatus(threadId: string, status: ChatFollowUpStatus): Promise<void>;
}
