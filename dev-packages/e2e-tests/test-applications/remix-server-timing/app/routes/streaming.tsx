import { LoaderFunctionArgs } from '@remix-run/node';
import { Await, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { Suspense } from 'react';

// Simulate a slow async operation
async function getSlowData(): Promise<{ message: string; timestamp: number }> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    message: 'Deferred data loaded (Single Fetch)!',
    timestamp: Date.now(),
  };
}

// Modern streaming using Single Fetch pattern (v3_singleFetch)
// Just return promises directly - turbo-stream handles streaming automatically
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  // Modern pattern: return promises directly, turbo-stream handles streaming
  return {
    immediate: { greeting: 'Hello from Single Fetch streaming route!' },
    deferred: getSlowData(), // Promise is streamed automatically
  };
};

export default function Streaming() {
  const { immediate, deferred } = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Single Fetch Streaming Response Test</h1>
      <p>Immediate data: {immediate.greeting}</p>

      <Suspense fallback={<p>Loading deferred data...</p>}>
        <Await resolve={deferred}>
          {data => (
            <div>
              <p>Deferred message: {data.message}</p>
              <p>Timestamp: {data.timestamp}</p>
            </div>
          )}
        </Await>
      </Suspense>
    </div>
  );
}
