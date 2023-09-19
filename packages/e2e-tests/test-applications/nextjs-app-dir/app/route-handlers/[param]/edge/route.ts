import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function PATCH() {
  return NextResponse.json({ name: 'John Doe' }, { status: 401 });
}

export async function DELETE() {
  throw new Error('route-handler-edge-error');
}
