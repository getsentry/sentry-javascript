import { NextResponse } from 'next/server';
import { makeHttpRequest } from '../utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await makeHttpRequest(`http://localhost:3030/propagation/test-outgoing-http/check`);
  return NextResponse.json(data);
}
