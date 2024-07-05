/* @refresh reload */
import * as Sentry from '@sentry/solid';
import { render } from 'solid-js/web';
import App from './app';
import './index.css';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  debug: true,
  environment: 'qa', // dynamic sampling bias to keep transactions
  integrations: [Sentry.browserTracingIntegration()],
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});

render(() => <App />, document.getElementById('root'));
