import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { RouterClient } from '@orpc/server';
import type { headers } from 'next/headers';
import { router } from './router';

declare global {
  var $headers: typeof headers;
}

const link = new RPCLink({
  url: new URL('/rpc', typeof window !== 'undefined' ? window.location.href : 'http://localhost:3030'),
  headers: async () => {
    return globalThis.$headers
      ? Object.fromEntries(await globalThis.$headers()) // ssr
      : {}; // browser
  },
});

export const client: RouterClient<typeof router> = createORPCClient(link);
