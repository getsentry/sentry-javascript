import { json, LoaderFunctionArgs } from '@remix-run/node';
import { Link, useSearchParams } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({});
};

export default function Index() {
  const [searchParams] = useSearchParams();

  if (searchParams.get('tag')) {
    Sentry.setTag('sentry_test', searchParams.get('tag'));
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Server-Timing Trace Propagation Test</h1>
      <ul>
        <li>
          <Link id="navigation" to="/user/123">
            Navigate to User 123
          </Link>
        </li>
      </ul>
    </div>
  );
}
