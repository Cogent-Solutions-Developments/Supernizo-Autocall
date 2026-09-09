import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { startSupernizoSignIn } from '@/server/auth/supernizo-sso';
import { notificationDeepLinkFromSearchParams } from '@/server/auth/notification-deep-link';
import { ValidationError } from '@/server/errors/app-error';

export function GET(request: NextRequest) {
  try {
    const portal = z
      .enum(['light', 'heavy'])
      .safeParse(request.nextUrl.searchParams.get('portal') ?? 'light');
    if (!portal.success) return NextResponse.json({ error: 'Invalid portal.' }, { status: 400 });
    const target = notificationDeepLinkFromSearchParams(request.nextUrl.searchParams);
    return startSupernizoSignIn(portal.data, target);
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Supernizo sign-in is not configured.' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
