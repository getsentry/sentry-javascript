import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  if (request.headers.has('x-should-throw')) {
    throw new Error('Middleware Error');
  }

  if (request.headers.has('x-should-make-request')) {
    await fetch('http://localhost:3030/');
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ['/api/endpoint-behind-middleware'],
};
