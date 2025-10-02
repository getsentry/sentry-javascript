import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ name: 'Beep' });
}

export async function POST() {
  return NextResponse.json({ name: 'Boop' }, { status: 400 });
}
