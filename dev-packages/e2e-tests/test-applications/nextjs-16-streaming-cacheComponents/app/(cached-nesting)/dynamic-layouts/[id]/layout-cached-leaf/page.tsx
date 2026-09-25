import { cacheLife } from 'next/cache';

async function CachedLeaf({ id }: { id: string }) {
  'use cache';
  cacheLife('hours');
  await new Promise(resolve => setTimeout(resolve, 100));
  return (
    <p id="cached-leaf">
      {id}:{Date.now()}
    </p>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CachedLeaf id={id} />;
}
