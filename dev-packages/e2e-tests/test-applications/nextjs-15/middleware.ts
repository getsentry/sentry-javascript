import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Keep this invocation in-flight for a bit so a concurrent request to the other matched endpoint genuinely
  // overlaps with it — the concurrency test in tests/middleware.test.ts relies on this overlap.
  if (request.nextUrl.pathname === '/api/endpoint-behind-middleware-2') {
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ['/api/endpoint-behind-middleware', '/api/endpoint-behind-middleware-2'],
};
