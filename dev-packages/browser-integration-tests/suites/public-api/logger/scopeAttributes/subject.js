// only log attribute
Sentry.logger.info('log_before_any_scope', { log_attr: 'log_attr_1' });

Sentry.getGlobalScope().setAttributes({ global_scope_attr: true });

// this attribute will not be sent for now
Sentry.getGlobalScope().setAttribute('array_attr', [1, 2, 3]);

// global scope, log attribute
Sentry.logger.info('log_after_global_scope', { log_attr: 'log_attr_2' });

Sentry.withIsolationScope(isolationScope => {
  isolationScope.setAttribute('isolation_scope_1_attr', { value: 100, unit: 'millisecond' });

  // global scope, isolation scope, log attribute
  Sentry.logger.info('log_with_isolation_scope', { log_attr: 'log_attr_3' });

  Sentry.withScope(scope => {
    scope.setAttributes({ scope_attr: { value: 200, unit: 'millisecond' } });

    // global scope, isolation scope, current scope attribute, log attribute
    Sentry.logger.info('log_with_scope', { log_attr: 'log_attr_4' });
  });

  Sentry.withScope(scope2 => {
    scope2.setAttribute('scope_2_attr', { value: 300, unit: 'millisecond' });

    // global scope, isolation scope, current scope attribute, log attribute
    Sentry.logger.info('log_with_scope_2', { log_attr: 'log_attr_5' });
  });
});

Sentry.flush();
