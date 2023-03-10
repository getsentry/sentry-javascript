import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ data: 'I am an edge route!', method: 'GET' });
}

export const runtime = 'experimental-edge';
