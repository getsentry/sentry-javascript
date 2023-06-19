import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.headers.has('x-should-throw')) {
    throw new Error('Middleware Error');
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ['/api/endpoint-behind-middleware'],
};
