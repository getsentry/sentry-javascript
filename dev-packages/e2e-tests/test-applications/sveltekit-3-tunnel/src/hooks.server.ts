import { handleErrorWithSentry, sentryHandle } from '@sentry/sveltekit';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const blockPosts: Handle = ({ event, resolve }) =>
  event.request.method === 'POST' ? new Response('blocked by user auth', { status: 401 }) : resolve(event);

export const handle = sequence(sentryHandle(), blockPosts);

export const handleError = handleErrorWithSentry();
