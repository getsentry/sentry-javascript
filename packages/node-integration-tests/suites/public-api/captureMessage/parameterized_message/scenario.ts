import * as Sentry from '@sentry/node';
import { parameterize } from '@sentry/utils';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
});

const x = 'first';
const y = 'second';

Sentry.captureMessage(parameterize`This is a log statement with ${x} and ${y} params`);
