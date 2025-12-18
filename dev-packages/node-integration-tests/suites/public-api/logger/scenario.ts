import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  enableLogs: true,
  transport: loggingTransport,
});

async function run(): Promise<void> {
  // only log attribute
  Sentry.logger.info('log_before_any_scope', { log_attr: 'log_attr_1' }, {});

  Sentry.getGlobalScope().setAttribute('global_scope_attr', true);

  // this attribute will not be sent for now
  Sentry.getGlobalScope().setAttributes({ array_attr: [1, 2, 3] });

  // global scope, log attribute
  Sentry.logger.info('log_after_global_scope', { log_attr: 'log_attr_2' }, {});

  Sentry.withIsolationScope(isolationScope => {
    isolationScope.setAttribute('isolation_scope_1_attr', { value: 100, unit: 'millisecond' });

    // global scope, isolation scope, log attribute
    Sentry.logger.info('log_with_isolation_scope', { log_attr: 'log_attr_3' }, {});

    Sentry.withScope(scope => {
      scope.setAttribute('scope_attr', { value: 200, unit: 'millisecond' });

      // global scope, isolation scope, current scope attribute, log attribute
      Sentry.logger.info('log_with_scope', { log_attr: 'log_attr_4' }, {});
    });

    Sentry.withScope(scope2 => {
      scope2.setAttribute('scope_2_attr', { value: 300, unit: 'millisecond' });

      // global scope, isolation scope, current scope attribute, log attribute
      Sentry.logger.info('log_with_scope_2', { log_attr: 'log_attr_5' }, {});
    });
  });

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
