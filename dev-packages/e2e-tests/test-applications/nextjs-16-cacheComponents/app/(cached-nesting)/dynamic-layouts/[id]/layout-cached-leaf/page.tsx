import { cacheLife } from 'next/cache';
import { CachedBox } from '@/components/scenarioBox';

async function CachedLeaf({ id }: { id: string }) {
  'use cache';
  cacheLife('hours');
  await new Promise(resolve => setTimeout(resolve, 100));
  return (
    <CachedBox label="CachedLeaf · use cache · hours">
      <p id="cached-leaf">
        {id}:{Date.now()}
      </p>
    </CachedBox>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CachedLeaf id={id} />;
}
