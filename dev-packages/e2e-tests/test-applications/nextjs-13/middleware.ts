import { NextResponse } from 'next/server';

export function middleware() {
  // Basic middleware to ensure that the build works with edge runtime
  return NextResponse.next();
}
