import { json, LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');

  if (tag) {
    Sentry.setTag('sentry_test', tag);
  }

  return json({ tag });
};

export default function PrefetchTest() {
  const { tag } = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Prefetch Test</h1>
      <p>This page tests Server-Timing with prefetch behavior.</p>

      <h3>Links with different prefetch modes:</h3>
      <ul>
        <li>
          <Link id="prefetch-intent" to={`/user/prefetch-target?tag=${tag}`} prefetch="intent">
            Prefetch on Intent (hover)
          </Link>
        </li>
        <li>
          <Link id="prefetch-render" to={`/user/prefetch-target2?tag=${tag}`} prefetch="render">
            Prefetch on Render
          </Link>
        </li>
        <li>
          <Link id="prefetch-none" to={`/user/prefetch-target3?tag=${tag}`} prefetch="none">
            No Prefetch
          </Link>
        </li>
      </ul>
    </div>
  );
}
