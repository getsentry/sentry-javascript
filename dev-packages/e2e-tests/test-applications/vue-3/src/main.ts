import './assets/main.css';

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

import * as Sentry from '@sentry/vue';
import { browserTracingIntegration } from '@sentry/vue';

const app = createApp(App);

Sentry.init({
  app,
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  tracesSampleRate: 1.0,
  integrations: [
    browserTracingIntegration({
      router,
    }),
  ],
  tunnel: `http://localhost:3031/`, // proxy server
  trackComponents: ['ComponentMainView', '<ComponentOneView>'],
});

app.use(router);
app.mount('#app');
