import * as Sentry from '@sentry/solidstart';
import { definePlugin } from 'nitro';

export default definePlugin(() => {
  Sentry.init({
    dsn: 'http://public@localhost:3031/1337',
    integrations: [Sentry.serveTunnelIntegration()],
    tracesSampleRate: 1,
  });
});
