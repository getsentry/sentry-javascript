import { wrapServerRouteWithSentry } from '@sentry/sveltekit';

// SvelteKit supports `QUERY` in `+server` files since 3.0
export const QUERY = wrapServerRouteWithSentry(async ({ request }) => {
  const { term } = await request.json();

  return new Response(JSON.stringify({ term, results: ['alice', 'bob'] }), {
    headers: { 'content-type': 'application/json' },
  });
});
