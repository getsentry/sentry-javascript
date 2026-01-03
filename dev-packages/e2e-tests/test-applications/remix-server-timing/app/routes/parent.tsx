import { json, LoaderFunctionArgs } from '@remix-run/node';
import { Outlet, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

// Parent route loader - runs before child loaders
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
    parentData: 'Parent loader data',
    parentTraceId: traceId,
  });
};

export default function Parent() {
  const { parentData, parentTraceId } = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Parent Route</h1>
      <p>Parent data: {parentData}</p>
      <p>
        Parent trace ID: <code>{parentTraceId}</code>
      </p>
      <div style={{ border: '1px solid #ccc', padding: '10px', marginTop: '10px' }}>
        <Outlet />
      </div>
    </div>
  );
}
