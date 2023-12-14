var loaderVariants = ['loader-with-no-global-init', 'loader-with-no-global-init-lazy-no'];

for (var idx in loaderVariants) {
  (() => {
    describe(loaderVariants[idx], function () {
      this.timeout(60000);
      this.retries(3);

      var sandbox;

      beforeEach(done => {
        sandbox = createSandbox(done, loaderVariants[idx]);
      });

      afterEach(() => {
        document.body.removeChild(sandbox);
      });

      describe('Loader Specific Tests - With no Global init() call', () => {
        it('should add breadcrumb from onLoad callback from undefined error', () =>
          runInSandbox(sandbox, () => {
            Sentry.onLoad(() => {
              initSDK();
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
            assert.ok(summary.breadcrumbs);
            assert.lengthOf(summary.breadcrumbs, 1);
            assert.equal(summary.breadcrumbs[0].message, 'testing loader');
          }));
      });
    });
  })();
}
