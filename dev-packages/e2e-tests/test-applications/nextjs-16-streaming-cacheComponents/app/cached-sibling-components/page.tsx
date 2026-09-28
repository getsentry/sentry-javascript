import { Suspense } from 'react';
import { cacheLife } from 'next/cache';

async function CachedSection({ id, label }: { id: string; label: string }) {
  'use cache';
  cacheLife('hours');
  await new Promise(resolve => setTimeout(resolve, 100));
  return (
    <section id={`cached-${label}`}>
      {label}:{id}:{Date.now()}
    </section>
  );
}

async function DynamicContent({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  // Awaiting searchParams makes this hole dynamic, so every request renders it and consults the
  // cache handler instead of serving prerendered output. The two sibling components cache as two
  // separate entries (the props are part of the cache key).
  const { id = 'default-id' } = await searchParams;
  return (
    <>
      <CachedSection id={id} label="first" />
      <CachedSection id={id} label="second" />
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DynamicContent searchParams={searchParams} />
    </Suspense>
  );
}
