import type { ReactNode } from 'react';
import { cacheLife } from 'next/cache';
import { CachedBox } from '@/components/scenarioBox';

// Hard-expires after 2s while the page's cached component lives for hours, so one request can
// refill the layout while hitting the component: two cached levels with different origin traces.
export default async function ShortLivedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  'use cache';
  cacheLife({ revalidate: 1, expire: 2 });
  const { id } = await params;
  return (
    <main>
      <h1>Mixed lifetimes</h1>
      <CachedBox label="ShortLivedLayout · use cache · expires after 2s · keyed by [id]">
        <p id="layout-stamp">
          {id}:{Date.now()}
        </p>
        {children}
      </CachedBox>
    </main>
  );
}
