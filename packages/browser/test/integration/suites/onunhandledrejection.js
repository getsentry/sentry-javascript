describe("window.onunhandledrejection", function() {
  it("should capture unhandledrejection with error", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        Promise.reject(new Error("test2"));
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        assert.equal(summary.events[0].exception.values[0].value, "test2");
        assert.equal(summary.events[0].exception.values[0].type, "Error");

        // Of course Safari had to screw up here...
        if (!/Version\/\d.+Safari\/\d/.test(window.navigator.userAgent)) {
          assert.isAtLeast(
            summary.events[0].exception.values[0].stacktrace.frames.length,
            1
          );
        }
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
      }
    });
  });

  it("should capture unhandledrejection with a string", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        Promise.reject("test");
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections doesnt provide stacktraces so we can skip the assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          "Non-Error promise rejection captured with value: test"
        );
        assert.equal(
          summary.events[0].exception.values[0].type,
          "UnhandledRejection"
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
      }
    });
  });

  it("should capture unhandledrejection with a monster string", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        Promise.reject("test".repeat(100));
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections doesnt provide stacktraces so we can skip the assertion
        assert.equal(summary.events[0].exception.values[0].value.length, 253);
        assert.include(
          summary.events[0].exception.values[0].value,
          "Non-Error promise rejection captured with value: "
        );
        assert.equal(
          summary.events[0].exception.values[0].type,
          "UnhandledRejection"
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
      }
    });
  });

  it("should capture unhandledrejection with an object", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        Promise.reject({ a: "b", b: "c", c: "d" });
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections doesnt provide stacktraces so we can skip the assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          "Non-Error promise rejection captured with keys: a, b, c"
        );
        assert.equal(
          summary.events[0].exception.values[0].type,
          "UnhandledRejection"
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
      }
    });
  });

  it("should capture unhandledrejection with an monster object", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        var a = {
          a: "1".repeat("100"),
          b: "2".repeat("100"),
          c: "3".repeat("100"),
        };
        a.d = a.a;
        a.e = a;
        Promise.reject(a);
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections doesnt provide stacktraces so we can skip the assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          "Non-Error promise rejection captured with keys: a, b, c, d, e"
        );
        assert.equal(
          summary.events[0].exception.values[0].type,
          "UnhandledRejection"
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
      }
    });
  });

  it("should capture unhandledrejection with a number", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        Promise.reject(1337);
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections doesnt provide stacktraces so we can skip the assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          "Non-Error promise rejection captured with value: 1337"
        );
        assert.equal(
          summary.events[0].exception.values[0].type,
          "UnhandledRejection"
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
      }
    });
  });

  it("should capture unhandledrejection with null", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        Promise.reject(null);
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections doesnt provide stacktraces so we can skip the assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          "Non-Error promise rejection captured with value: null"
        );
        assert.equal(
          summary.events[0].exception.values[0].type,
          "UnhandledRejection"
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
      }
    });
  });

  it("should capture unhandledrejection with an undefined", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        Promise.reject(undefined);
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections doesnt provide stacktraces so we can skip the assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          "Non-Error promise rejection captured with value: undefined"
        );
        assert.equal(
          summary.events[0].exception.values[0].type,
          "UnhandledRejection"
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
      }
    });
  });

  it("should skip our own failed requests that somehow bubbled-up to unhandledrejection handler", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        Promise.reject({
          __sentry_own_request__: true,
        });
        Promise.reject({
          __sentry_own_request__: false,
        });
        Promise.reject({});
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        assert.equal(summary.events.length, 2);
      }
    });
  });
});
