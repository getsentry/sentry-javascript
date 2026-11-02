import { headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';

// The dynamic part, and with it the trace meta tag, streams in seconds after the shell, so a test
// can navigate while the pageload still waits for the tag.
async function SlowContent() {
  await headers();
  await new Promise(resolve => setTimeout(resolve, 4000));
  return <p id="slow-content">Slow content</p>;
}

export default function Page() {
  return (
    <>
      <Link id="navigate" href="/static-shell">
        Static shell
      </Link>
      <Suspense fallback={<p id="slow-fallback">Loading...</p>}>
        <SlowContent />
      </Suspense>
    </>
  );
}
