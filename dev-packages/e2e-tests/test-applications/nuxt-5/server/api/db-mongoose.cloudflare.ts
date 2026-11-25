import { defineHandler } from 'nitro';
import { HTTPError } from 'nitro/h3';

// Replaces `db-mongoose.ts` on Cloudflare, see `MONGOOSE_UNSUPPORTED` in `tests/runtime.ts`.
export default defineHandler(() => {
  throw new HTTPError({ status: 501 });
});
