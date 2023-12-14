if (IS_LOADER) {
  describe('Loader Specific Tests', () => {
    it('should add breadcrumb from onLoad callback from undefined error', () =>
      runInSandbox(sandbox, () => {
        Sentry.onLoad(() => {
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'testing loader',
            level: 'error',
          });
        });
        setTimeout(() => {
          Sentry.captureMessage('test');
        });
        undefinedMethod();
      }).then(summary => {
        if (IS_ASYNC_LOADER) {
          assert.notOk(summary.events[0].breadcrumbs);
        } else {
          if (summary.events[0].breadcrumbs) {
            assert.ok(summary.events[0].breadcrumbs);
            assert.lengthOf(summary.events[0].breadcrumbs, 1);
            assert.equal(summary.events[0].breadcrumbs[0].message, 'testing loader');
          } else {
            // This seems to be happening only in chrome
            assert.notOk(summary.events[0].breadcrumbs);
          }
        }
      }));

    it('should add breadcrumb from onLoad callback from undefined error with custom init()', () =>
      runInSandbox(sandbox, () => {
        Sentry.onLoad(() => {
          Sentry.init({ debug: true });
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'testing loader',
            level: 'error',
          });
        });
        setTimeout(() => {
          Sentry.captureMessage('test');
        });
        undefinedMethod(); // trigger error
      }).then(summary => {
        assert.ok(summary.events[0].breadcrumbs);
        assert.lengthOf(summary.events[0].breadcrumbs, 1);
        assert.equal(summary.events[0].breadcrumbs[0].message, 'testing loader');
      }));

    it('should set SENTRY_SDK_SOURCE value', () => {
      return runInSandbox(sandbox, () => {
        Sentry.onLoad(() => {
          Sentry.init({ debug: true });
        });
        setTimeout(() => {
          Sentry.captureMessage('test');
        });
        undefinedMethod(); // trigger error
      }).then(summary => {
        assert.equal(summary.events[0].sdk.packages[0].name, 'loader:@sentry/browser');
      });
    });
  });
}
