import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ data: 'I am a static route!', method: 'GET' });
}
