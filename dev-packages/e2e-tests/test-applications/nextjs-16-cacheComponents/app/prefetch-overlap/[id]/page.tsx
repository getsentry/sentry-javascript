import { Suspense } from 'react';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Result params={params} />
    </Suspense>
  );
}

async function Result({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <p id="result">{`prefetched ${id}`}</p>;
}
