import { withSentry } from '@sentry/tanstackstart-react';

import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import type { ServerEntry } from '@tanstack/react-start/server-entry';

const requestHandler: ServerEntry = withSentry({
  fetch(request: Request) {
    console.log('requestHandler fetch');
    console.log(request);
    return handler.fetch(request);
  },
});

export default createServerEntry(requestHandler);
