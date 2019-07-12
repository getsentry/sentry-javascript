describe("config", function() {
  it("should allow to ignore specific errors", function() {
    return runInSandbox(sandbox, function() {
      Sentry.captureException(new Error("foo"));
      Sentry.captureException(new Error("ignoreErrorTest"));
      Sentry.captureException(new Error("bar"));
    }).then(function(summary) {
      assert.equal(summary.events[0].exception.values[0].type, "Error");
      assert.equal(summary.events[0].exception.values[0].value, "foo");
      assert.equal(summary.events[1].exception.values[0].type, "Error");
      assert.equal(summary.events[1].exception.values[0].value, "bar");
    });
  });

  it("should allow to ignore specific urls", function() {
    return runInSandbox(sandbox, function() {
      /**
       * We always filter on the caller, not the cause of the error
       *
       * > foo.js file called a function in bar.js
       * > bar.js file called a function in baz.js
       * > baz.js threw an error
       *
       * foo.js is blacklisted in the `init` call (init.js), thus we filter it
       * */
      var urlWithBlacklistedUrl = new Error("filter");
      urlWithBlacklistedUrl.stack =
        "Error: bar\n" +
        " at http://localhost:5000/foo.js:7:19\n" +
        " at bar(http://localhost:5000/bar.js:2:3)\n" +
        " at baz(http://localhost:5000/baz.js:2:9)\n";

      /**
       * > foo-pass.js file called a function in bar-pass.js
       * > bar-pass.js file called a function in baz-pass.js
       * > baz-pass.js threw an error
       *
       * foo-pass.js is *not* blacklisted in the `init` call (init.js), thus we don't filter it
       * */
      var urlWithoutBlacklistedUrl = new Error("pass");
      urlWithoutBlacklistedUrl.stack =
        "Error: bar\n" +
        " at http://localhost:5000/foo-pass.js:7:19\n" +
        " at bar(http://localhost:5000/bar-pass.js:2:3)\n" +
        " at baz(http://localhost:5000/baz-pass.js:2:9)\n";

      Sentry.captureException(urlWithBlacklistedUrl);
      Sentry.captureException(urlWithoutBlacklistedUrl);
    }).then(function(summary) {
      assert.lengthOf(summary.events, 1);
      assert.equal(summary.events[0].exception.values[0].type, "Error");
      assert.equal(summary.events[0].exception.values[0].value, "pass");
    });
  });
});
