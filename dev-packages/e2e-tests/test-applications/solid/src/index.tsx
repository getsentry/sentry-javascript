/* @refresh reload */
import * as Sentry from '@sentry/solid';
import { Router, useBeforeLeave, useLocation } from '@solidjs/router';
import { render } from 'solid-js/web';
import './index.css';
import PageRoot from './pageroot';
import { routes } from './routes';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  debug: true,
  environment: 'qa', // dynamic sampling bias to keep transactions
  integrations: [Sentry.solidRouterBrowserTracingIntegration({ useBeforeLeave, useLocation })],
  release: 'e2e-test',
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});

const SentryRouter = Sentry.withSentryRouterRouting(Router);

render(() => <SentryRouter root={PageRoot}>{routes}</SentryRouter>, document.getElementById('root'));
