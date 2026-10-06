import { Suspense } from 'react';
import { cacheLife } from 'next/cache';
import { CachedBox, DynamicBox } from '@/components/scenarioBox';

async function getSlowChangingValue(id: string): Promise<{ id: string; createdAt: number }> {
  'use cache';
  cacheLife('hours');
  await new Promise(resolve => setTimeout(resolve, 100));
  return { id, createdAt: Date.now() };
}

async function ShortLivedSection({ id }: { id: string }) {
  'use cache';
  // The component entry hard-expires after 2s while the nested function entry lives on, so a
  // delayed request refills the component and reads the nested entry as a hit inside that fill.
  cacheLife({ revalidate: 1, expire: 2 });
  const nested = await getSlowChangingValue(id);
  return (
    <CachedBox label="ShortLivedSection · use cache · expires after 2s">
      <CachedBox label="getSlowChangingValue · use cache · hours">
        <div id="nested-data">{JSON.stringify({ ...nested, renderedAt: Date.now() })}</div>
      </CachedBox>
    </CachedBox>
  );
}

async function DynamicContent({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  // Awaiting searchParams makes this hole dynamic, so every request renders it and consults the
  // cache handler instead of serving prerendered output.
  const { id = 'default-id' } = await searchParams;
  return (
    <DynamicBox label="dynamic hole · awaits searchParams">
      <p>request-time: {Date.now()}</p>
      <ShortLivedSection id={id} />
    </DynamicBox>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  return (
    <main>
      <h1>Nested caches with different lifetimes</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
