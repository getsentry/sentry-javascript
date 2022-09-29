import { createApp } from 'vue';
import './style.css';
import App from './App.vue';

import * as Sentry from '@sentry/vue';
import { BrowserTracing } from '@sentry/tracing';

const app = createApp(App);

Sentry.init({
  app,
  dsn: 'https://8308099df418455f9845cb7719b70590@o172566.ingest.sentry.io/1870657',
  integrations: [new BrowserTracing()],
  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

app.mount('#app');
