import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';

import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import type { ServerEntry } from '@tanstack/react-start/server-entry';

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    return handler.fetch(request, opts);
  },
});

export default createServerEntry(requestHandler);
