import 'server-only';
import { createVisitorInsightsService } from '@/server/application/visitors/visitor-insights-service';
import { createVisitorInsightsRepository } from '@/server/infrastructure/repositories/visitor-insights-repository';
export * from '@/server/application/visitors/visitor-insights-service';
const service = createVisitorInsightsService({ repository: createVisitorInsightsRepository() });
export const { toUtcDateRange, getVisitorProfile, getSiteAnalytics } = service;
