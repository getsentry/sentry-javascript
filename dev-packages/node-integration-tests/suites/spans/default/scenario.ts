import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  traceLifecycle: 'stream',
  debug: true,
});

Sentry.getCurrentScope().setAttribute('scope_attr', { value: 100, unit: 'millisecond' });

Sentry.startSpan({ name: 'parent' }, parentSpan => {
  parentSpan.setAttribute('parent_span_attr', true);
  Sentry.startSpan({ name: 'child' }, childSpan => {
    childSpan.addLink({ context: parentSpan.spanContext(), attributes: { child_link_attr: 'hi' } });
    Sentry.startSpan({ name: 'grandchild' }, grandchildSpan => {
      Sentry.updateSpanName(grandchildSpan, 'grandchild_new_name');
    });
  });
});

Sentry.flush();
