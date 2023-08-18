import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Sentry.Integrations.ExtraErrorData({})],
});

const error = new TypeError('foo') as Error & { baz: number; foo: string };
error.baz = 42;
error.foo = 'bar';

Sentry.captureException(error);
