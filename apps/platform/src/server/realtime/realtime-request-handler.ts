import 'server-only';

import { handle } from '@upstash/realtime';

import { requireSiteAccess } from '@/server/auth/access';

import { authorizeRealtimeChannels } from './channel-authorization';
import { createUpstashRealtimeClient } from './upstash-realtime-provider';
import { verifyVisitorRealtimeToken } from './visitor-token';
import { getCallScope } from '../services/call-service';
import { getChatThreadScope } from '../services/chat-service';

export function resolveVisitorRealtimeToken(request: Request, pathToken?: string): string | null {
  return pathToken ?? new URL(request.url).searchParams.get('visitor_token');
}

export async function handleRealtimeRequest(
  request: Request,
  pathToken?: string,
): Promise<Response> {
  const visitorToken = resolveVisitorRealtimeToken(request, pathToken);
  const routeHandler = handle({
    middleware: async ({ channels, request: realtimeRequest }) => {
      const visitorChannel = verifyVisitorRealtimeToken(
        resolveVisitorRealtimeToken(realtimeRequest, visitorToken ?? undefined),
      );
      const isAuthorized = await authorizeRealtimeChannels(channels, {
        authorizeDashboardCall: async (callId) => {
          try {
            const scope = await getCallScope(callId);
            if (!scope) return false;
            await requireSiteAccess(scope.siteId);
            return true;
          } catch {
            return false;
          }
        },
        authorizeDashboardChat: async (threadId) => {
          try {
            const scope = await getChatThreadScope(threadId);
            if (!scope) return false;
            await requireSiteAccess(scope.siteId);
            return true;
          } catch {
            return false;
          }
        },
        authorizeDashboardSite: async (siteId) => {
          try {
            await requireSiteAccess(siteId);
            return true;
          } catch {
            return false;
          }
        },
        visitorChannel,
      });

      return isAuthorized ? undefined : new Response('Unauthorized channel.', { status: 403 });
    },
    realtime: createUpstashRealtimeClient(),
  });
  const response = await routeHandler(request);
  return response ?? new Response(null, { status: 204 });
}
