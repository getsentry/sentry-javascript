import { createError, defineEventHandler } from '#imports';

// Replaces `db-mongoose.ts` on Cloudflare, see `MONGOOSE_UNSUPPORTED` in `tests/runtime.ts`.
export default defineEventHandler(() => {
  throw createError({ statusCode: 501 });
});
