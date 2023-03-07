import { NextResponse } from 'next/server';

interface Params {
  params: Record<string, string>;
}

export async function GET(_request: Request, { params }: Params) {
  return NextResponse.json({ data: 'I am a dynamic route!', params, method: 'GET' });
}

export async function POST(_request: Request, { params }: Params) {
  return NextResponse.json({ data: 'I am a dynamic route!', params, method: 'POST' });
}

export async function PUT(_request: Request, { params }: Params) {
  return NextResponse.json({ data: 'I am a dynamic route!', params, method: 'PUT' });
}

export async function PATCH(_request: Request, { params }: Params) {
  return NextResponse.json({ data: 'I am a dynamic route!', params, method: 'PATCH' });
}

export async function DELETE(_request: Request, { params }: Params) {
  return NextResponse.json({ data: 'I am a dynamic route!', params, method: 'DELETE' });
}

export async function HEAD(_request: Request, { params }: Params) {
  return NextResponse.json({ data: 'I am a dynamic route!', params, method: 'HEAD' });
}

export async function OPTIONS(_request: Request, { params }: Params) {
  return NextResponse.json({ data: 'I am a dynamic route!', params, method: 'OPTIONS' });
}
