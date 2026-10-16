import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  // Stands in for auth middleware, without blocking the other tests.
  if (request.headers.get('x-e2e-require-auth') && !Sentry.isTunnelRequest(request)) {
    return new NextResponse(null, { status: 401 });
  }

  return NextResponse.next();
}

// Match all routes to test that tunnel requests are properly filtered
export const config = {
  matcher: '/:path*',
};
