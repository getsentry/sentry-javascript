import type { ExportedHandler, Response as CFResponse } from '@cloudflare/workers-types';

export default ({
  async fetch(request, env, ctx) {
    return new Response('Hello Sentry!') as unknown as CFResponse;
  },
} satisfies ExportedHandler);
