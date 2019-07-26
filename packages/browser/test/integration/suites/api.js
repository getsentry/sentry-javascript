describe("API", function() {
  it("should capture Sentry.captureMessage", function() {
    return runInSandbox(sandbox, function() {
      Sentry.captureMessage("Hello");
    }).then(function(summary) {
      assert.equal(summary.events[0].message, "Hello");
    });
  });

  it("should capture Sentry.captureException", function() {
    return runInSandbox(sandbox, function() {
      try {
        foo();
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(function(summary) {
      assert.isAtLeast(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        2
      );
      assert.isAtMost(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        4
      );
    });
  });

  it("should generate a synthetic trace for captureException w/ non-errors", function() {
    return runInSandbox(sandbox, function() {
      throwNonError();
    }).then(function(summary) {
      assert.isAtLeast(summary.events[0].stacktrace.frames.length, 1);
      assert.isAtMost(summary.events[0].stacktrace.frames.length, 3);
    });
  });

  it("should have correct stacktrace order", function() {
    return runInSandbox(sandbox, function() {
      try {
        foo();
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(function(summary) {
      assert.equal(
        summary.events[0].exception.values[0].stacktrace.frames[
          summary.events[0].exception.values[0].stacktrace.frames.length - 1
        ].function,
        "bar"
      );
      assert.isAtLeast(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        2
      );
      assert.isAtMost(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        4
      );
    });
  });

  it("should have exception with type and value", function() {
    return runInSandbox(sandbox, function() {
      Sentry.captureException("this is my test exception");
    }).then(function(summary) {
      assert.isNotEmpty(summary.events[0].exception.values[0].value);
      assert.isNotEmpty(summary.events[0].exception.values[0].type);
    });
  });

  it("should reject duplicate, back-to-back errors from captureException", function() {
    return runInSandbox(sandbox, function() {
      // Different exceptions, don't dedupe
      for (var i = 0; i < 2; i++) {
        throwRandomError();
      }

      // Same exceptions and same stacktrace, dedupe
      for (var i = 0; i < 2; i++) {
        throwError();
      }

      // Same exceptions, different stacktrace (different line number), don't dedupe
      throwSameConsecutiveErrors("bar");
    }).then(function(summary) {
      assert.match(
        summary.events[0].exception.values[0].value,
        /Exception no \d+/
      );
      assert.match(
        summary.events[1].exception.values[0].value,
        /Exception no \d+/
      );
      assert.equal(summary.events[2].exception.values[0].value, "foo");
      assert.equal(summary.events[3].exception.values[0].value, "bar");
      assert.equal(summary.events[4].exception.values[0].value, "bar");
    });
  });

  it("should not reject back-to-back errors with different stack traces", function() {
    return runInSandbox(sandbox, function() {
      // same error message, but different stacks means that these are considered
      // different errors

      // stack:
      //   bar
      try {
        bar(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }

      // stack (different # frames):
      //   bar
      //   foo
      try {
        foo(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }

      // stack (same # frames, different frames):
      //   bar
      //   foo2
      try {
        foo2(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(function(summary) {
      // NOTE: regex because exact error message differs per-browser
      assert.match(summary.events[0].exception.values[0].value, /baz/);
      assert.equal(
        summary.events[0].exception.values[0].type,
        "ReferenceError"
      );
      assert.match(summary.events[1].exception.values[0].value, /baz/);
      assert.equal(
        summary.events[1].exception.values[0].type,
        "ReferenceError"
      );
      assert.match(summary.events[2].exception.values[0].value, /baz/);
      assert.equal(
        summary.events[2].exception.values[0].type,
        "ReferenceError"
      );
    });
  });

  it("should reject duplicate, back-to-back messages from captureMessage", function() {
    return runInSandbox(sandbox, function() {
      // Different messages, don't dedupe
      for (var i = 0; i < 2; i++) {
        captureRandomMessage();
      }

      // Same messages and same stacktrace, dedupe
      for (var i = 0; i < 2; i++) {
        captureMessage("same message, same stacktrace");
      }

      // Same messages, different stacktrace (different line number), don't dedupe
      captureSameConsecutiveMessages("same message, different stacktrace");
    }).then(function(summary) {
      // On the async loader since we replay all messages from the same location,
      // so we actually only receive 4 summary.events
      assert.match(summary.events[0].message, /Message no \d+/);
      assert.match(summary.events[1].message, /Message no \d+/);
      assert.equal(summary.events[2].message, "same message, same stacktrace");
      assert.equal(
        summary.events[3].message,
        "same message, different stacktrace"
      );
      !IS_LOADER &&
        assert.equal(
          summary.events[4].message,
          "same message, different stacktrace"
        );
    });
  });
});
