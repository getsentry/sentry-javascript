var loaderVariants = [
  "loader-with-no-global-init",
  "loader-with-no-global-init-lazy-no",
];

for (var idx in loaderVariants) {
  (function() {
    describe(loaderVariants[idx], function() {
      this.timeout(60000);
      this.retries(3);

      var sandbox;

      beforeEach(function(done) {
        sandbox = createSandbox(done, loaderVariants[idx]);
      });

      afterEach(function() {
        document.body.removeChild(sandbox);
      });

      describe("Loader Specific Tests - With no Global init() call", function() {
        it("should add breadcrumb from onLoad callback from undefined error", function() {
          return runInSandbox(sandbox, function() {
            Sentry.onLoad(function() {
              initSDK();
              Sentry.addBreadcrumb({
                category: "auth",
                message: "testing loader",
                level: "error",
              });
            });
            setTimeout(function() {
              Sentry.captureMessage("test");
            });
            undefinedMethod();
          }).then(function(summary) {
            assert.ok(summary.breadcrumbs);
            assert.lengthOf(summary.breadcrumbs, 1);
            assert.equal(summary.breadcrumbs[0].message, "testing loader");
          });
        });
      });
    });
  })();
}
