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

  // something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
  // to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
  // the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
  // see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
  // https://github.com/getsentry/sentry-javascript/issues/2380
  it("should capture PromiseRejectionEvent cast to CustomEvent with type unhandledrejection", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        // this isn't how it happens in real life, in that the promise and reason
        // values come from an actual PromiseRejectionEvent, but it's enough to test
        // how the SDK handles the structure
        window.dispatchEvent(
          new CustomEvent("unhandledrejection", {
            detail: {
              promise: new Promise(() => {}),
              // we're testing with an error here but it could be anything - really
              // all we're testing is that it gets dug out correctly
              reason: new Error("test2"),
            },
          })
        );
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
        // even though it's a regular Event (rather than a PRE) it should still only
        // come through this channel
        assert.equal(summary.events.length, 1);
      }
    });
  });

  // there's no evidence that this actually happens, but it could, and our code correctly
  // handles it, so might as well prevent future regression on that score
  it("should capture a random Event with type unhandledrejection", function() {
    return runInSandbox(sandbox, function() {
      if (supportsOnunhandledRejection()) {
        window.dispatchEvent(new Event("unhandledrejection"));
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function(summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          "Non-Error promise rejection captured with keys: currentTarget, isTrusted, target, type"
        );
        assert.equal(summary.events[0].exception.values[0].type, "Event");
        assert.equal(
          summary.events[0].exception.values[0].mechanism.handled,
          false
        );
        assert.equal(
          summary.events[0].exception.values[0].mechanism.type,
          "onunhandledrejection"
        );
        // even though it's a regular Event (rather than a PRE) it should sill only
        // come through this channel
        assert.equal(summary.events.length, 1);
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
        // non-error rejections don't provide stacktraces so we can skip that assertion
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
        // non-error rejections don't provide stacktraces so we can skip that assertion
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
        // non-error rejections don't provide stacktraces so we can skip that assertion
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
        // non-error rejections don't provide stacktraces so we can skip that assertion
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
        // non-error rejections don't provide stacktraces so we can skip that assertion
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
        // non-error rejections don't provide stacktraces so we can skip that assertion
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
        // non-error rejections don't provide stacktraces so we can skip that assertion
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
