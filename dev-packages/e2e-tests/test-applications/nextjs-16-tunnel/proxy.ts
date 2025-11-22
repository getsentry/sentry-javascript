import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(_request: NextRequest) {
  return NextResponse.next();
}

// Match all routes to test that tunnel requests are properly filtered
export const config = {
  matcher: '/:path*',
};
