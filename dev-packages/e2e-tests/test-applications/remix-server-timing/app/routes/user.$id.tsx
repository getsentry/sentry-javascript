import { json, LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { useEffect } from 'react';

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  // Set the tag on the server side so it's included in the server transaction
  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, 10));
  return json({ userId: params.id, tag });
};

export default function User() {
  const { userId, tag } = useLoaderData<typeof loader>();

  useEffect(() => {
    // Also set the tag on the client side for the pageload transaction
    if (tag) {
      Sentry.setTag('sentry_test', tag);
    }
  }, [tag]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>User {userId}</h1>
      <p>This is a parameterized route for user {userId}.</p>
      <Link to="/">Back to Home</Link>
    </div>
  );
}
