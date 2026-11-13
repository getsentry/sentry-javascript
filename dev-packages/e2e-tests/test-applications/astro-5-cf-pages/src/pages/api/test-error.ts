import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = () => {
  throw new Error('This is a test error from an API route');
};
