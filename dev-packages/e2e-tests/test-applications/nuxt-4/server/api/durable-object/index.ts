import { defineEventHandler, getRequestURL } from '#imports';

// With the `cloudflare_durable` preset, `durableFetch` sends a request to the Durable Object of Nitro, which handles it
// with the same Nitro app.
export default defineEventHandler(async event => {
  const { durableFetch } = event.context.cloudflare as { durableFetch: (request: Request) => Promise<Response> };
  const response = await durableFetch(new Request(new URL('/api/durable-object/target', getRequestURL(event))));

  return response.json();
});
