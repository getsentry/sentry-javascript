import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

Sentry.setTags({ tag_1: 'foo', tag_2: Math.PI, tag_3: false, tag_4: null, tag_5: undefined, tag_6: -1 });

Sentry.captureMessage('primitive_tags-set-tags');
