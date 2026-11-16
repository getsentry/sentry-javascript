import * as Sentry from '@sentry/solidstart';
import { mount, StartClient } from '@solidjs/start/client';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  tunnel: true,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
});

mount(() => <StartClient />, document.getElementById('app')!);
