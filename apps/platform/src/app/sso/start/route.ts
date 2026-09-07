import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { startSupernizoSignIn } from '@/server/auth/supernizo-sso';

export function GET(request: NextRequest) {
  try {
    const portal = z
      .enum(['light', 'heavy'])
      .safeParse(request.nextUrl.searchParams.get('portal') ?? 'light');
    if (!portal.success) return NextResponse.json({ error: 'Invalid portal.' }, { status: 400 });
    return startSupernizoSignIn(portal.data);
  } catch {
    return NextResponse.json(
      { error: 'Supernizo sign-in is not configured.' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
