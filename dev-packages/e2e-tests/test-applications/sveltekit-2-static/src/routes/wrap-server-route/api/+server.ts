import { wrapServerRouteWithSentry } from '@sentry/sveltekit';
import { error } from '@sveltejs/kit';

export const GET = wrapServerRouteWithSentry(async () => {
  error(500, 'error() error');
});
