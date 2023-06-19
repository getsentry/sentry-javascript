import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ['/api/endpoint-behind-middleware'],
};
