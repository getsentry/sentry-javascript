import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler from '@tanstack/react-start/server-entry';

const requestHandler = wrapFetchWithSentry({
  fetch(request, opts) {
    return handler.fetch(request, opts);
  },
});

// A Worker gets `env` and `ctx` as arguments, which a TanStack Start server entry does not take.
export default {
  fetch(request: Request, _env: unknown, ctx?: { waitUntil?: unknown }) {
    // Lets a test check that the Worker's `ctx` survives the Sentry Vite plugins wrapping the server entry.
    if (new URL(request.url).pathname === '/test-execution-context') {
      return new Response(typeof ctx?.waitUntil);
    }

    return requestHandler.fetch(request, { context: { fromServerEntry: 'request-context-value' } });
  },
};
