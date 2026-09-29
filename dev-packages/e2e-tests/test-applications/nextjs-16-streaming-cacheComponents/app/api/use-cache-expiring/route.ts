import { cacheLife } from 'next/cache';
import type { NextRequest } from 'next/server';

async function getExpiringValue(id: string): Promise<{ id: string; createdAt: number }> {
  'use cache';
  // Hard-expires after 2 seconds, so a delayed second request exercises the expired-entry path.
  cacheLife({ revalidate: 1, expire: 2 });
  return { id, createdAt: Date.now() };
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? 'default-id';
  return Response.json(await getExpiringValue(id));
}
