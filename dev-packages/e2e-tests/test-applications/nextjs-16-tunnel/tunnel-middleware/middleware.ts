import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const tunnelResponse = Sentry.handleTunnelRequestIfMatched(request);
  if (tunnelResponse) {
    return tunnelResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
