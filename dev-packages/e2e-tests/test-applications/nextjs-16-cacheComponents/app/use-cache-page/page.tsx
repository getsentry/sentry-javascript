import { Suspense } from 'react';
import { cacheLife } from 'next/cache';
import { CachedBox, DynamicBox } from '@/components/scenarioBox';

async function getCachedPageData(id: string): Promise<{ id: string; createdAt: number }> {
  'use cache';
  cacheLife('hours');
  await new Promise(resolve => setTimeout(resolve, 100));
  return { id, createdAt: Date.now() };
}

export default function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  return (
    <main>
      <h1>Cached data function in a page</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <CachedContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CachedContent({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  // Awaiting searchParams makes this hole dynamic, so every request renders it and consults the
  // cache handler instead of serving prerendered output.
  const { id = 'default-id' } = await searchParams;
  const data = await getCachedPageData(id);
  return (
    <DynamicBox label="dynamic hole · awaits searchParams">
      <p>request-time: {Date.now()}</p>
      <CachedBox label="getCachedPageData · use cache · hours">
        <div id="cached-data">{JSON.stringify(data)}</div>
      </CachedBox>
    </DynamicBox>
  );
}
