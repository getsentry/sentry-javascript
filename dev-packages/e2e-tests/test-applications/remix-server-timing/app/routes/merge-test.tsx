import { HeadersFunction, json, LoaderFunctionArgs } from '@remix-run/node';
import * as Sentry from '@sentry/remix';

// Export headers function to include loader headers in document responses
// See: https://remix.run/docs/en/main/route/headers
export const headers: HeadersFunction = ({ loaderHeaders }) => {
  return loaderHeaders;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  return json(
    { message: 'Merge test route' },
    {
      headers: {
        // Set an existing Server-Timing header that should be merged with Sentry's
        'Server-Timing': 'db;dur=53.2, cache;desc="Cache Read";dur=1.5',
      },
    },
  );
};

export default function MergeTest() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Server-Timing Merge Test</h1>
      <p>This route sets an existing Server-Timing header to test merging.</p>
      <p>
        Expected: db;dur=53.2, cache;desc=&quot;Cache Read&quot;;dur=1.5, sentry-trace;desc=&quot;...&quot;,
        baggage;desc=&quot;...&quot;
      </p>
    </div>
  );
}
