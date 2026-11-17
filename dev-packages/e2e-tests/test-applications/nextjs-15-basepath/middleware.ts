import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return (await Sentry.handleTunnelRequestIfMatched(request)) ?? NextResponse.next();
}

export const config = {
  // The managed tunnel path is one segment of up to 7 characters, derived from the DSN.
  matcher: '/:path([a-z0-9]{1,7})',
};
