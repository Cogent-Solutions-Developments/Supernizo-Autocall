import type { ChatMessage } from './contracts';
import type { UserProfile } from './profile';

export type AgentProfileRecord = Readonly<{
  displayName: string | null;
  profile?: UserProfile | null;
}>;

export function getAgentIdentity(agent: AgentProfileRecord | null): UserProfile | null {
  if (!agent) return null;
  return {
    displayName: agent.profile?.displayName ?? agent.displayName ?? 'Support agent',
    imageUrl: agent.profile?.imageUrl ?? null,
  };
}

export const VISITOR_PRESENCE_TIMEOUT_MS = 45_000;

export function getChatAgentIdentity(
  messages: readonly ChatMessage[],
  sessionStartedAt?: string,
): UserProfile | null {
  const startedAt = sessionStartedAt ? Date.parse(sessionStartedAt) : -Infinity;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.senderType === 'AGENT' && Date.parse(message.sentAt) >= startedAt) {
      return {
        displayName: message.senderName ?? 'Support agent',
        imageUrl: message.senderAvatarUrl ?? null,
      };
    }
  }
  return null;
}
