import { defineEventHandler } from 'nuxt/server';

// `$fetch` is a Nitro global, not a `nuxt/server` export, so the portable copy uses `fetch`.
export default defineEventHandler(async () => {
  const response = await fetch('https://example.com');
  return response.text();
});
