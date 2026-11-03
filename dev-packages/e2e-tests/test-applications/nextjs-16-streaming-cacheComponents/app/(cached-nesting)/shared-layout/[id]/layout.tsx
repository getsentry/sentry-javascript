import type { ReactNode } from 'react';
import { cacheLife } from 'next/cache';
import { CachedBox } from '@/components/scenarioBox';

// One cache entry (keyed by id) shared by the sibling routes `a` and `b` below.
export default async function SharedLayout({
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
    <main>
      <h1>Shared layout across sibling routes</h1>
      <CachedBox label="SharedLayout · use cache · hours · shared by /a and /b">
        <p id="shared-layout-stamp">
          {id}:{Date.now()}
        </p>
        {children}
      </CachedBox>
    </main>
  );
}
