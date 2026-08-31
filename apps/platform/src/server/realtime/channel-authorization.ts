import 'server-only';

import { IdSchema, RequestIdSchema } from '@supernizo/shared';

type ParsedRealtimeChannel =
  | Readonly<{ callId: string; type: 'call' }>
  | Readonly<{ threadId: string; type: 'chat' }>
  | Readonly<{ siteId: string; type: 'site' }>
  | Readonly<{ anonymousVisitorId: string; siteId: string; type: 'visitor' }>;

export function parseRealtimeChannel(channel: string): ParsedRealtimeChannel | undefined {
  const callMatch = /^call:([^:]+)$/.exec(channel);
  if (callMatch?.[1]) {
    const callId = IdSchema.safeParse(callMatch[1]);
    return callId.success ? { callId: callId.data, type: 'call' } : undefined;
  }

  const chatMatch = /^chat:([^:]+)$/.exec(channel);
  if (chatMatch?.[1]) {
    const threadId = IdSchema.safeParse(chatMatch[1]);
    return threadId.success ? { threadId: threadId.data, type: 'chat' } : undefined;
  }

  const siteMatch = /^site:([^:]+)$/.exec(channel);
  if (siteMatch?.[1]) {
    const siteId = IdSchema.safeParse(siteMatch[1]);
    return siteId.success ? { siteId: siteId.data, type: 'site' } : undefined;
  }

  const visitorMatch = /^visitor:([^:]+):([^:]+)$/.exec(channel);
  if (visitorMatch?.[1] && visitorMatch[2]) {
    const siteId = IdSchema.safeParse(visitorMatch[1]);
    const anonymousVisitorId = RequestIdSchema.safeParse(visitorMatch[2]);
    return siteId.success && anonymousVisitorId.success
      ? { anonymousVisitorId: anonymousVisitorId.data, siteId: siteId.data, type: 'visitor' }
      : undefined;
  }

  return undefined;
}

export async function authorizeRealtimeChannels(
  channels: readonly string[],
  dependencies: Readonly<{
    authorizeDashboardCall: (callId: string) => Promise<boolean>;
    authorizeDashboardChat: (threadId: string) => Promise<boolean>;
    authorizeDashboardSite: (siteId: string) => Promise<boolean>;
    visitorChannel: string | undefined;
  }>,
): Promise<boolean> {
  if (channels.length === 0) {
    return false;
  }

  for (const channel of channels) {
    const parsedChannel = parseRealtimeChannel(channel);
    if (!parsedChannel) {
      return false;
    }

    if (parsedChannel.type === 'call') {
      if (!(await dependencies.authorizeDashboardCall(parsedChannel.callId))) {
        return false;
      }
    } else if (parsedChannel.type === 'chat') {
      if (dependencies.visitorChannel === channel) {
        continue;
      }
      if (!(await dependencies.authorizeDashboardChat(parsedChannel.threadId))) {
        return false;
      }
    } else if (parsedChannel.type === 'site') {
      if (!(await dependencies.authorizeDashboardSite(parsedChannel.siteId))) {
        return false;
      }
    } else if (dependencies.visitorChannel !== channel) {
      return false;
    }
  }

  return true;
}
