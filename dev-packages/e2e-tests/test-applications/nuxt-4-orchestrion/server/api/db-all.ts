import { defineEventHandler } from '#imports';

export default defineEventHandler(async () => {
  // `$fetch` is a Nitro runtime global; relative paths route to local handlers,
  // so all sibling db routes run (and emit their spans) within this request.
  const [ioredis, mysql] = await Promise.all([
    $fetch('/api/db-ioredis'),
    $fetch('/api/db-mysql'),
  ]);

  return { ioredis, mysql };
});
