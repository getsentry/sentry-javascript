// SOURCEMAP_MARKER_SERVER
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';

import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import type { ServerEntry } from '@tanstack/react-start/server-entry';

declare module '@tanstack/react-router' {
  interface Register {
    server: {
      requestContext: { fromServerEntry: string };
    };
  }
}

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    return handler.fetch(request, opts);
  },
});

export default createServerEntry({
  fetch(request, opts) {
    return requestHandler.fetch(request, { ...opts, context: { fromServerEntry: 'request-context-value' } });
  },
});
