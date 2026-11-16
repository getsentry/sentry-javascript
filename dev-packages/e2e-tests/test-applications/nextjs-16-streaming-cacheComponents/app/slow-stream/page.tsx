import { headers } from 'next/headers';
import { Suspense } from 'react';

// Above the pageload's 10 second wait for the trace meta tag, but short enough that the tag still
// arrives before the pageload ends.
const DELAY_MS = 10_500;

async function SlowContent() {
  await headers();
  await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  return <p id="slow-content">Slow content</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SlowContent />
    </Suspense>
  );
}
