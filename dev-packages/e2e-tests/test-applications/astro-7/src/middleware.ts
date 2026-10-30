import { defineMiddleware } from 'astro:middleware';

// The tunnel variant checks that the managed tunnel answers before an auth middleware like this one.
export const onRequest = defineMiddleware((context, next) => {
  if (
    import.meta.env.PUBLIC_E2E_TEST_TUNNEL &&
    context.request.method === 'POST' &&
    context.request.headers.get('x-auth') !== 'ok'
  ) {
    return new Response('blocked by user auth', { status: 401 });
  }

  return next();
});
