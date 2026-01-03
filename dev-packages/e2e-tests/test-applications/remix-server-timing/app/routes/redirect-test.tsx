import { LoaderFunctionArgs, redirect } from '@remix-run/node';
import * as Sentry from '@sentry/remix';

// Route that returns a redirect response
// Tests that Server-Timing headers are present on redirect responses

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  // Redirect to user page, preserving the tag
  const targetUrl = tag ? `/user/redirected?tag=${tag}` : '/user/redirected';
  return redirect(targetUrl);
};

// No default export needed - loader always redirects
