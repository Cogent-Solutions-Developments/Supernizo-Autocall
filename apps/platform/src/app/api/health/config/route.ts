import { NextResponse } from 'next/server';

import { getConfigurationReadiness } from '@/server/infrastructure/diagnostics/config-readiness';

export const runtime = 'nodejs';

export function GET(): NextResponse {
  return NextResponse.json(getConfigurationReadiness());
}
