import { defineEventHandler, getRequestURL } from '#imports';

export default defineEventHandler(async event => {
  const response = await fetch(new URL('/api/headers', getRequestURL(event).origin));
  return response.json();
});
