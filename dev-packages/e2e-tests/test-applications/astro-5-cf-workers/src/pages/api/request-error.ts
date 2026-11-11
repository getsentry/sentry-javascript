import type { APIRoute } from 'astro';

export const prerender = false;

// A distinct message per request, so the Dedupe integration doesn't drop repeats.
export const GET: APIRoute = ({ url }) => {
  throw new Error(`API route error for request ${url.searchParams.get('request')}`);
};
