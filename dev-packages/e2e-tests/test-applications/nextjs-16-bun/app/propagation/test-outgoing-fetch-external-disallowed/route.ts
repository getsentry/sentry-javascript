import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await fetch(`http://localhost:3030/propagation/test-outgoing-fetch-external-disallowed/check`, {
    cache: 'no-store',
  }).then(res => res.json());
  return NextResponse.json(data);
}
