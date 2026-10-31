import { cacheLife } from 'next/cache';
import { headers } from 'next/headers';
import { Suspense } from 'react';

// The shell goes stale after a second, so a later visit makes the server prerender it again at
// runtime. An `expire` below 5 minutes would make Next.js leave this out of the shell.
async function RenderedAt() {
  'use cache';
  cacheLife({ revalidate: 1, expire: 3600 });
  return <p id="rendered-at">{Date.now()}</p>;
}

async function RequestContent() {
  await headers();
  return <p id="request-content">Rendered for this request</p>;
}

export default function Page() {
  return (
    <>
      <RenderedAt />
      <Suspense fallback={<p>Loading...</p>}>
        <RequestContent />
      </Suspense>
    </>
  );
}
