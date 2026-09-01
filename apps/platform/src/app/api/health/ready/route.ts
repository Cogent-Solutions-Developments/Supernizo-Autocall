import { NextResponse } from 'next/server';

import { getDatabaseClient } from '@/server/db/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    await getDatabaseClient().$queryRaw`SELECT 1`;
    return NextResponse.json({ database: true, ready: true });
  } catch {
    return NextResponse.json({ database: false, ready: false }, { status: 503 });
  }
}
