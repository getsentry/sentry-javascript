import { defer, LoaderFunctionArgs } from '@remix-run/node';
import { Await, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { Suspense } from 'react';

// Simulate a slow async operation
async function getSlowData(): Promise<{ message: string; timestamp: number }> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    message: 'Deferred data loaded (legacy)!',
    timestamp: Date.now(),
  };
}

// Legacy streaming using defer() - deprecated but still supported
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  // Legacy pattern: use defer() explicitly
  return defer({
    immediate: { greeting: 'Hello from legacy streaming route!' },
    deferred: getSlowData(),
  });
};

export default function StreamingLegacy() {
  const { immediate, deferred } = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Legacy Streaming Response Test (defer)</h1>
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
