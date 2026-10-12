import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  const response = await fetch(new URL('/api/headers', url.origin));
  return Response.json(await response.json());
};
