describe("window.onerror", function() {
  it("should catch syntax errors", function() {
    return runInSandbox(sandbox, function() {
      eval("foo{};");
    }).then(function(summary) {
      // ¯\_(ツ)_/¯
      if (summary.window.isBelowIE11()) {
        assert.equal(summary.events[0].exception.values[0].type, "Error");
      } else {
        assert.match(summary.events[0].exception.values[0].type, /SyntaxError/);
      }
      assert.equal(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        1
      ); // just one frame
    });
  });

  it("should catch thrown strings", function() {
    return runInSandbox(sandbox, { manual: true }, function() {
      // intentionally loading this error via a script file to make
      // sure it is 1) not caught by instrumentation 2) doesn't trigger
      // "Script error"
      var script = document.createElement("script");
      script.src = "/base/subjects/throw-string.js";
      script.onload = function() {
        window.finalizeManualTest();
      };
      document.head.appendChild(script);
    }).then(function(summary) {
      assert.match(summary.events[0].exception.values[0].value, /stringError$/);
      assert.equal(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        1
      ); // always 1 because thrown strings can't provide > 1 frame

      // some browsers extract proper url, line, and column for thrown strings
      // but not all - falls back to frame url
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0].filename,
        /(\/subjects\/throw-string.js|\/base\/variants\/)/
      );
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0]["function"],
        /throwStringError|\?|global code/i
      );
    });
  });

  it("should catch thrown objects", function() {
    return runInSandbox(sandbox, { manual: true }, function() {
      // intentionally loading this error via a script file to make
      // sure it is 1) not caught by instrumentation 2) doesn't trigger
      // "Script error"
      var script = document.createElement("script");
      script.src = "/base/subjects/throw-object.js";
      script.onload = function() {
        window.finalizeManualTest();
      };
      document.head.appendChild(script);
    }).then(function(summary) {
      assert.equal(summary.events[0].exception.values[0].type, "Error");

      // ¯\_(ツ)_/¯
      if (summary.window.isBelowIE11()) {
        assert.equal(
          summary.events[0].exception.values[0].value,
          "[object Object]"
        );
      } else {
        assert.equal(
          summary.events[0].exception.values[0].value,
          "Non-Error exception captured with keys: error, somekey"
        );
      }
      assert.equal(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        1
      ); // always 1 because thrown objects can't provide > 1 frame

      // some browsers extract proper url, line, and column for thrown objects
      // but not all - falls back to frame url
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0].filename,
        /(\/subjects\/throw-object.js|\/base\/variants\/)/
      );
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0]["function"],
        /throwStringError|\?|global code/i
      );
    });
  });

  it("should catch thrown errors", function() {
    return runInSandbox(sandbox, { manual: true }, function() {
      // intentionally loading this error via a script file to make
      // sure it is 1) not caught by instrumentation 2) doesn't trigger
      // "Script error"
      var script = document.createElement("script");
      script.src = "/base/subjects/throw-error.js";
      script.onload = function() {
        window.finalizeManualTest();
      };
      document.head.appendChild(script);
    }).then(function(summary) {
      // ¯\_(ツ)_/¯
      if (summary.window.isBelowIE11()) {
        assert.equal(summary.events[0].exception.values[0].type, "Error");
      } else {
        assert.match(summary.events[0].exception.values[0].type, /^Error/);
      }
      assert.match(summary.events[0].exception.values[0].value, /realError$/);
      // 1 or 2 depending on platform
      assert.isAtLeast(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        1
      );
      assert.isAtMost(
        summary.events[0].exception.values[0].stacktrace.frames.length,
        2
      );
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0].filename,
        /\/subjects\/throw-error\.js/
      );
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0]["function"],
        /\?|global code|throwRealError/i
      );
    });
  });

  it("should onerror calls with non-string first argument gracefully", function() {
    return runInSandbox(sandbox, function() {
      window.onerror({
        type: "error",
        otherKey: "hi",
      });
    }).then(function(summary) {
      assert.equal(summary.events[0].exception.values[0].type, "Error");
      assert.equal(
        summary.events[0].exception.values[0].value,
        "Non-Error exception captured with keys: otherKey, type"
      );
      assert.deepEqual(summary.events[0].extra.__serialized__, {
        type: "error",
        otherKey: "hi",
      });
    });
  });

  it("should NOT catch an exception already caught [but rethrown] via Sentry.captureException", function() {
    return runInSandbox(sandbox, function() {
      try {
        foo();
      } catch (e) {
        Sentry.captureException(e);
        throw e; // intentionally re-throw
      }
    }).then(function(summary) {
      // IE10 uses different type (Error instead of ReferenceError) for rethrown errors...
      if (!summary.window.isBelowIE11()) {
        assert.equal(summary.events.length, 1);
      }
    });
  });
});
