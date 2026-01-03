import { LoaderFunctionArgs } from '@remix-run/node';
import * as Sentry from '@sentry/remix';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  // Throw an error to test 500 response handling
  throw new Error('Test error for Server-Timing propagation');
};

export default function ErrorTest() {
  return (
    <div>
      <h1>Error Test Route</h1>
      <p>This should not render - the loader throws an error.</p>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <div>
      <h1>Error Occurred</h1>
      <p>An error was thrown in the loader.</p>
    </div>
  );
}
