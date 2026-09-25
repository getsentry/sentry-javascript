import type { ReactNode } from 'react';
import { cacheLife } from 'next/cache';

// The awaited param puts the request id into the cache key, so a fresh id is a guaranteed miss
// and the entry cannot come from a build-time fill. `children` passes through as an uncached hole.
export default async function CachedMidLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  'use cache';
  cacheLife('hours');
  const { id } = await params;
  await new Promise(resolve => setTimeout(resolve, 100));
  return (
    <div data-testid="cached-mid-layout">
      <p id="cached-layout-stamp">
        {id}:{Date.now()}
      </p>
      {children}
    </div>
  );
}
