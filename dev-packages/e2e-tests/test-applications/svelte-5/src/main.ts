import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

import * as Sentry from '@sentry/svelte';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  tracesSampleRate: 1.0,
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  tunnel: 'http://localhost:3031/', // proxy server
  debug: !!process.env.DEBUG,
});

const target = document.getElementById('app');

if (!target) {
  throw new Error('Could not find target element');
}

const app = mount(App, { target });

export default app;
