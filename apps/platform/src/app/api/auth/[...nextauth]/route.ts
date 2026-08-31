import NextAuth from 'next-auth/next';
import type { NextRequest } from 'next/server';

import { getAuthOptions } from '@/server/auth/auth-options';

type AuthRouteContext = Readonly<{
  params: Promise<{
    nextauth: string[];
  }>;
}>;

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: AuthRouteContext): Promise<Response> {
  return NextAuth(request, context, getAuthOptions());
}

export async function POST(request: NextRequest, context: AuthRouteContext): Promise<Response> {
  return NextAuth(request, context, getAuthOptions());
}
