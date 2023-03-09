import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ data: 'I am a dynamic route!', method: 'GET' });
}

export async function POST() {
  return NextResponse.json({ data: 'I am a dynamic route!', method: 'POST' });
}

export async function PUT() {
  return NextResponse.json({ data: 'I am a dynamic route!', method: 'PUT' });
}

export async function PATCH() {
  return NextResponse.json({ data: 'I am a dynamic route!', method: 'PATCH' });
}

export async function DELETE() {
  return NextResponse.json({ data: 'I am a dynamic route!', method: 'DELETE' });
}

export async function HEAD() {
  return NextResponse.json({ data: 'I am a dynamic route!', method: 'HEAD' });
}

export async function OPTIONS() {
  return NextResponse.json({ data: 'I am a dynamic route!', method: 'OPTIONS' });
}
