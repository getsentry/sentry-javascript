import { json, LoaderFunctionArgs } from '@remix-run/node';
import * as Sentry from '@sentry/remix';

// Resource route - no default export, just returns JSON
// This is commonly used for API endpoints in Remix

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  return json({
    success: true,
    data: {
      message: 'Hello from resource route!',
      timestamp: Date.now(),
    },
  });
};
