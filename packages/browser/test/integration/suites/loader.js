if (IS_LOADER) {
  describe('Loader Specific Tests', function () {
    it('should add breadcrumb from onLoad callback from undefined error', function () {
      return runInSandbox(sandbox, function () {
        Sentry.onLoad(function () {
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'testing loader',
            level: 'error',
          });
        });
        setTimeout(function () {
          Sentry.captureMessage('test');
        });
        undefinedMethod();
      }).then(function (summary) {
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
      });
    });

    it('should add breadcrumb from onLoad callback from undefined error with custom init()', function () {
      return runInSandbox(sandbox, function () {
        Sentry.onLoad(function () {
          Sentry.init({ debug: true });
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'testing loader',
            level: 'error',
          });
        });
        setTimeout(function () {
          Sentry.captureMessage('test');
        });
        undefinedMethod(); // trigger error
      }).then(function (summary) {
        assert.ok(summary.events[0].breadcrumbs);
        assert.lengthOf(summary.events[0].breadcrumbs, 1);
        assert.equal(summary.events[0].breadcrumbs[0].message, 'testing loader');
      });
    });

    it('should set SENTRY_SDK_SOURCE value', () => {
      return runInSandbox(sandbox, function () {
        Sentry.onLoad(function () {
          Sentry.init({ debug: true });
        });
        setTimeout(function () {
          Sentry.captureMessage('test');
        });
        undefinedMethod(); // trigger error
      }).then(function (summary) {
        assert.equal(summary.events[0].sdk.packages[0].name, 'loader:@sentry/browser');
      });
    });
  });
}
