import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ request, url }) => {
  if (url.searchParams.has('error')) {
    throw new Error('Endpoint Error');
  }
  return new Response(
    JSON.stringify({
      search: url.search,
      sp: url.searchParams,
    }),
  );
};
