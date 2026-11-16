import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) =>
  context.request.method === 'POST' ? new Response('blocked by user auth', { status: 401 }) : next(),
);
