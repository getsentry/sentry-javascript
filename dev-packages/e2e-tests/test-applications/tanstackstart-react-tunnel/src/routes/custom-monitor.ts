import * as Sentry from '@sentry/tanstackstart-react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/custom-monitor')({
  server: Sentry.createSentryTunnelRoute({ allowedDsns: ['http://public@localhost:3031/1337'] }),
});
