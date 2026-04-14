import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    traceLifecycle: 'stream',
    release: '1.0.0',
  }),
  {
    async fetch(_request, _env, _ctx) {
      Sentry.startSpan({ name: 'test-span', op: 'test' }, segmentSpan => {
        Sentry.startSpan({ name: 'test-child-span', op: 'test-child' }, () => {
          // noop
        });

        const inactiveSpan = Sentry.startInactiveSpan({ name: 'test-inactive-span' });
        inactiveSpan.addLink({
          context: segmentSpan.spanContext(),
          attributes: { 'sentry.link.type': 'some_relation' },
        });
        inactiveSpan.end();

        Sentry.startSpanManual({ name: 'test-manual-span' }, span => {
          span.end();
        });
      });

      return new Response('OK');
    },
  },
);
