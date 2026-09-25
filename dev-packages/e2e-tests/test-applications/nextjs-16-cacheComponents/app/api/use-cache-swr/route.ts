import { cacheLife } from 'next/cache';
import type { NextRequest } from 'next/server';

async function getSwrValue(id: string): Promise<{ id: string; createdAt: number }> {
  'use cache';
  // Past `revalidate` (2s) a read serves the stale value and triggers a background refill;
  // `expire` is long so the entry never hard-expires during the test.
  cacheLife({ stale: 5, revalidate: 2, expire: 300 });
  return { id, createdAt: Date.now() };
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? 'default-id';
  return Response.json(await getSwrValue(id));
}
