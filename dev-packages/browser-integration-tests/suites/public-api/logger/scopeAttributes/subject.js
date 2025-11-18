// only log attribute
Sentry.logger.info('log_before_any_scope', { log_attr: 'scope_attr_1' });

Sentry.getGlobalScope().setAttribute('global_scope_attr', true);

// global scope, log attribute
Sentry.logger.info('log_after_global_scope', { log_attr: 'scope_attr_2' });

let isolScope = null;
let isolScope2 = null;

Sentry.withIsolationScope(isolationScope => {
  isolScope = isolationScope;
  isolationScope.setAttribute('isolation_scope_1_attr', { value: 100, unit: 'ms' });

  // global scope, isolation scope, log attribute
  Sentry.logger.info('log_with_isolation_scope', { log_attr: 'scope_attr_3' });

  Sentry.withScope(scope => {
    scope.setAttribute('scope_attr', { value: 200, unit: 'ms' });

    // global scope, isolation scope, current scope attribute, log attribute
    Sentry.logger.info('log_with_scope', { log_attr: 'scope_attr_4' });
  });

  Sentry.withScope(scope2 => {
    scope2.setAttribute('scope_2_attr', { value: 300, unit: 'ms' });

    // global scope, isolation scope, current scope attribute, log attribute
    Sentry.logger.info('log_with_scope_2', { log_attr: 'scope_attr_5' });
  });
});

Sentry.flush();
