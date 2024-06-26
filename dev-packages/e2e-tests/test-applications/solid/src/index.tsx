/* @refresh reload */
import * as Sentry from '@sentry/solid';
import { render } from 'solid-js/web';
import App from './app';
import './index.css';

Sentry.init({
  dsn:
    import.meta.env.PUBLIC_E2E_TEST_DSN ||
    'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  debug: true,
  environment: 'qa', // dynamic sampling bias to keep transactions
  integrations: [Sentry.browserTracingIntegration()],
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});

render(() => <App />, document.getElementById('root'));
