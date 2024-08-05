import { wrapServerRouteWithSentry } from '@sentry/sveltekit';
import { error } from '@sveltejs/kit';

export const GET = wrapServerRouteWithSentry(async () => {
  console.log('API call');
  error(500, 'error() error');
  return new Response(JSON.stringify({ myMessage: 'hi from API route' }));
});
