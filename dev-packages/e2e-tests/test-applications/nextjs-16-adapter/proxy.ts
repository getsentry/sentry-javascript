import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== '/api/proxy-isolation') {
    return NextResponse.next();
  }

  const requestId = request.nextUrl.searchParams.get('id');

  Sentry.addBreadcrumb({ message: `proxy breadcrumb ${requestId}` });

  // Lets a concurrent request add its breadcrumb before this one captures its error
  await new Promise(resolve => setTimeout(resolve, 500));

  Sentry.captureException(new Error(`Proxy error ${requestId}`));

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/proxy-isolation', '/api/proxy-ok', '/monitoring'],
};
