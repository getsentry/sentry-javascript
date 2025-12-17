import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';

import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import type { ServerEntry } from '@tanstack/react-start/server-entry';

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request: Request) {
    return handler.fetch(request);
  },
});

export default createServerEntry(requestHandler);
