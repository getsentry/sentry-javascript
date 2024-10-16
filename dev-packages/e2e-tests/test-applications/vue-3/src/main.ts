import './assets/main.css';

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

import { createPinia } from 'pinia';

import * as Sentry from '@sentry/vue';
import { browserTracingIntegration } from '@sentry/vue';

const app = createApp(App);
const pinia = createPinia();

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

pinia.use(
  Sentry.createSentryPiniaPlugin({
    actionTransformer: action => `Transformed: ${action}`,
    stateTransformer: state => ({
      transformed: true,
      ...state,
    }),
  }),
);

app.use(pinia);
app.use(router);
app.mount('#app');
