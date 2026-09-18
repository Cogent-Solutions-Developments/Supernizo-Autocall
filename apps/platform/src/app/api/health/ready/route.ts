import { NextResponse } from 'next/server';

import { getDependencyReadiness } from '@/server/diagnostics/dependency-readiness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const readiness = await getDependencyReadiness();
  return NextResponse.json(readiness, { status: readiness.ready ? 200 : 503 });
}
