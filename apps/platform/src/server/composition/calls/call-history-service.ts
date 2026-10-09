import 'server-only';
import { createCallHistoryService } from '@/server/application/calls/call-history-service';
import { createCallHistoryRepository } from '@/server/infrastructure/repositories/call-history-repository';
export * from '@/server/application/calls/call-history-service';
const service = createCallHistoryService({ repository: createCallHistoryRepository() });
export const { getCallFailureReason, listCallHistory, listVisitorCallHistory, listAgentsForSite } =
  service;
