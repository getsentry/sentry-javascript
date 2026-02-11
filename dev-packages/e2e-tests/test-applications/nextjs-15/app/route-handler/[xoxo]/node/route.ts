import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ message: 'Hello Node Route Handler' });
}

export async function POST() {
  return NextResponse.json({ name: 'Boop' }, { status: 400 });
}
