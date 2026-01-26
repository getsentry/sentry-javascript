import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

// Child route loader - runs after parent loader
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  // Get current trace info for debugging
  const span = Sentry.getActiveSpan();
  const rootSpan = span ? Sentry.getRootSpan(span) : null;
  const traceId = rootSpan ? Sentry.spanToJSON(rootSpan).trace_id : 'no-trace';

  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, 5));

  return json({
    childData: 'Child loader data',
    childTraceId: traceId,
  });
};

export default function Child() {
  const { childData, childTraceId } = useLoaderData<typeof loader>();

  return (
    <div>
      <h2>Child Route</h2>
      <p>Child data: {childData}</p>
      <p>
        Child trace ID: <code>{childTraceId}</code>
      </p>
    </div>
  );
}
