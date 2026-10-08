import type { ChatMessage } from '@supernizo/shared';

export function mergeChatMessage(
  messages: readonly ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (messages.some((message) => message.id === incoming.id)) return [...messages];

  return [...messages, incoming].sort((left, right) => left.sentAt.localeCompare(right.sentAt));
}
