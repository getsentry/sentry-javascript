import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const globalScope = Sentry.getGlobalScope();
const isolationScope = Sentry.getIsolationScope();
const currentScope = Sentry.getCurrentScope();

globalScope.setExtra('aa', 'aa');
isolationScope.setExtra('bb', 'bb');
currentScope.setExtra('cc', 'cc');

Sentry.captureMessage('outer_before');

Sentry.withScope(scope => {
  scope.setExtra('dd', 'dd');
  Sentry.captureMessage('inner');
});

Sentry.captureMessage('outer_after');
