import { json, LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { useEffect } from 'react';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  // Set the tag on the server side so it's included in the server transaction
  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  return json({ tag });
};

export default function Index() {
  const { tag } = useLoaderData<typeof loader>();

  useEffect(() => {
    // Also set the tag on the client side for the pageload transaction
    if (tag) {
      Sentry.setTag('sentry_test', tag);
    }
  }, [tag]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Server-Timing Trace Propagation Test</h1>
      <p>This test app validates that trace context is propagated via Server-Timing header.</p>
      <ul>
        <li>
          <Link id="navigation" to="/user/123">
            Navigate to User 123
          </Link>
        </li>
        <li>
          <Link id="navigation-456" to="/user/456">
            Navigate to User 456
          </Link>
        </li>
      </ul>
    </div>
  );
}
