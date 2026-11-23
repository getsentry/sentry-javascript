import { defineEventHandler, getRequestURL } from '#imports';

export default defineEventHandler(async event => {
  // The runtime's own `fetch`, not Nitro's `$fetch`, which calls a local route without a request.
  const response = await fetch(new URL('/api/echo-headers', getRequestURL(event).origin));
  return response.json();
});
