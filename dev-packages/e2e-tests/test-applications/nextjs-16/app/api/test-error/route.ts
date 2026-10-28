import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  throw new Error('This is a test error from an API route');
  return NextResponse.json({ success: false });
}
