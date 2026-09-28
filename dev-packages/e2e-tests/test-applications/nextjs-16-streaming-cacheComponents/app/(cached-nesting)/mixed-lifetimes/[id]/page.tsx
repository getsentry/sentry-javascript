import { headers } from 'next/headers';
import { cacheLife } from 'next/cache';

async function LongLivedComponent({ id }: { id: string }) {
  'use cache';
  cacheLife('hours');
  await new Promise(resolve => setTimeout(resolve, 100));
  return (
    <p id="component-stamp">
      {id}:{Date.now()}
    </p>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await headers();
  return <LongLivedComponent id={id} />;
}
