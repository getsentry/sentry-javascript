import { cacheLife, cacheTag } from 'next/cache';
import type { NextRequest } from 'next/server';

async function getCachedValue(id: string): Promise<{ id: string; createdAt: number }> {
  'use cache';
  // The 'hours' profile has a finite `expire` (1 day), so the entry carries a real TTL.
  cacheLife('hours');
  cacheTag('e2e-use-cache-tag');
  await new Promise(resolve => setTimeout(resolve, 100));
  return { id, createdAt: Date.now() };
}

export async function GET(request: NextRequest) {
  // The id ends up in the cache key (it is an argument of the cached function), so tests get a
  // guaranteed cache miss by passing a fresh id.
  const id = request.nextUrl.searchParams.get('id') ?? 'default-id';
  return Response.json(await getCachedValue(id));
}
