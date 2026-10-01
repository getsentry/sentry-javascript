import { headers } from 'next/headers';
import { cacheLife } from 'next/cache';
import { CachedBox, DynamicBox } from '@/components/scenarioBox';

async function LongLivedComponent({ id }: { id: string }) {
  'use cache';
  cacheLife('hours');
  await new Promise(resolve => setTimeout(resolve, 100));
  return (
    <CachedBox label="LongLivedComponent · use cache · hours">
      <p id="component-stamp">
        {id}:{Date.now()}
      </p>
    </CachedBox>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await headers();
  return (
    <DynamicBox label="page · awaits headers">
      <p>request-time: {Date.now()}</p>
      <LongLivedComponent id={id} />
    </DynamicBox>
  );
}
