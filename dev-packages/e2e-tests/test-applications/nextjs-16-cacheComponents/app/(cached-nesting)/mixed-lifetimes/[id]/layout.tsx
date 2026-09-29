import type { ReactNode } from 'react';
import { cacheLife } from 'next/cache';

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
    <div data-testid="short-lived-layout">
      <p id="layout-stamp">
        {id}:{Date.now()}
      </p>
      {children}
    </div>
  );
}
