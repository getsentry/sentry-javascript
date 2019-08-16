describe("wrapped built-ins", function() {
  it("should capture exceptions from event listeners", function() {
    return runInSandbox(sandbox, function() {
      var div = document.createElement("div");
      document.body.appendChild(div);
      div.addEventListener(
        "click",
        function() {
          window.element = div;
          window.context = this;
          foo();
        },
        false
      );
      var click = new MouseEvent("click");
      div.dispatchEvent(click);
    }).then(function(summary) {
      // Make sure we preserve the correct context
      assert.equal(summary.window.element, summary.window.context);
      delete summary.window.element;
      delete summary.window.context;
      assert.match(summary.events[0].exception.values[0].value, /baz/);
    });
  });

  it("should transparently remove event listeners from wrapped functions", function() {
    return runInSandbox(sandbox, function() {
      var div = document.createElement("div");
      document.body.appendChild(div);
      var click = new MouseEvent("click");
      var fooFn = function() {
        foo();
      };
      var barFn = function() {
        bar();
      };
      div.addEventListener("click", fooFn, false);
      div.addEventListener("click", barFn);
      div.removeEventListener("click", barFn);
      div.dispatchEvent(new MouseEvent("click"));
    }).then(function(summary) {
      assert.lengthOf(summary.events, 1);
    });
  });

  describe("unhandledrejection", function() {
    it("should capture unhandledrejection with error", function() {
      return runInSandbox(sandbox, function() {
        if (isChrome()) {
          Promise.reject(new Error("test2"));
        } else {
          window.resolveTest({ window: window });
        }
      }).then(function(summary) {
        if (summary.window.isChrome()) {
          assert.equal(summary.events[0].exception.values[0].value, "test2");
          assert.equal(summary.events[0].exception.values[0].type, "Error");
          assert.isAtLeast(
            summary.events[0].exception.values[0].stacktrace.frames.length,
            1
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

    it("should capture unhandledrejection with a string", function() {
      return runInSandbox(sandbox, function() {
        if (isChrome()) {
          Promise.reject("test");
        } else {
          window.resolveTest({ window: window });
        }
      }).then(function(summary) {
        if (summary.window.isChrome()) {
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
          assert.equal(
            summary.events[0].exception.values[0].mechanism.data.incomplete,
            true
          );
        }
      });
    });

    it("should capture unhandledrejection with a monster string", function() {
      return runInSandbox(sandbox, function() {
        if (isChrome()) {
          Promise.reject("test".repeat(100));
        } else {
          window.resolveTest({ window: window });
        }
      }).then(function(summary) {
        if (summary.window.isChrome()) {
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
          assert.equal(
            summary.events[0].exception.values[0].mechanism.data.incomplete,
            true
          );
        }
      });
    });

    it("should capture unhandledrejection with an object", function() {
      return runInSandbox(sandbox, function() {
        if (isChrome()) {
          Promise.reject({ a: "b", b: "c", c: "d" });
        } else {
          window.resolveTest({ window: window });
        }
      }).then(function(summary) {
        if (summary.window.isChrome()) {
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
          assert.equal(
            summary.events[0].exception.values[0].mechanism.data.incomplete,
            true
          );
        }
      });
    });

    it("should capture unhandledrejection with an monster object", function() {
      return runInSandbox(sandbox, function() {
        if (isChrome()) {
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
        if (summary.window.isChrome()) {
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
          assert.equal(
            summary.events[0].exception.values[0].mechanism.data.incomplete,
            true
          );
        }
      });
    });

    it("should capture unhandledrejection with a number", function() {
      return runInSandbox(sandbox, function() {
        if (isChrome()) {
          Promise.reject(1337);
        } else {
          window.resolveTest({ window: window });
        }
      }).then(function(summary) {
        if (summary.window.isChrome()) {
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
        if (isChrome()) {
          Promise.reject(null);
        } else {
          window.resolveTest({ window: window });
        }
      }).then(function(summary) {
        if (summary.window.isChrome()) {
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
        if (isChrome()) {
          Promise.reject(undefined);
        } else {
          window.resolveTest({ window: window });
        }
      }).then(function(summary) {
        if (summary.window.isChrome()) {
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
  });

  it("should capture exceptions inside setTimeout", function() {
    return runInSandbox(sandbox, function() {
      setTimeout(function() {
        foo();
      });
    }).then(function(summary) {
      assert.match(summary.events[0].exception.values[0].value, /baz/);
    });
  });

  it("should capture exceptions inside setInterval", function() {
    return runInSandbox(sandbox, function() {
      var exceptionInterval = setInterval(function() {
        clearInterval(exceptionInterval);
        foo();
      }, 0);
    }).then(function(summary) {
      assert.match(summary.events[0].exception.values[0].value, /baz/);
    });
  });

  it("should capture exceptions inside requestAnimationFrame", function() {
    // needs to be visible or requestAnimationFrame won't ever fire
    sandbox.style.display = "block";

    return runInSandbox(sandbox, { manual: true }, function() {
      requestAnimationFrame(function() {
        window.finalizeManualTest();
        foo();
      });
    }).then(function(summary) {
      assert.match(summary.events[0].exception.values[0].value, /baz/);
    });
  });

  it("should capture exceptions from XMLHttpRequest event handlers (e.g. onreadystatechange)", function() {
    return runInSandbox(sandbox, { manual: true }, function() {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "/base/subjects/example.json");
      // intentionally assign event handlers *after* open, since this is what jQuery does
      xhr.onreadystatechange = function() {
        window.finalizeManualTest();
        // replace onreadystatechange with no-op so exception doesn't
        // fire more than once as XHR changes loading state
        xhr.onreadystatechange = function() {};
        foo();
      };
      xhr.send();
    }).then(function(summary) {
      assert.match(summary.events[0].exception.values[0].value, /baz/);
    });
  });

  it(
    optional(
      "should capture built-in's mechanism type as instrument",
      IS_LOADER
    ),
    function() {
      return runInSandbox(sandbox, function() {
        setTimeout(function() {
          foo();
        });
      }).then(function(summary) {
        if (IS_LOADER) {
          // The async loader doesn't wrap setTimeout
          // so we don't receive the full mechanism
          assert.ok(summary.events[0].exception.values[0].mechanism);
        } else {
          var fn =
            summary.events[0].exception.values[0].mechanism.data.function;
          delete summary.events[0].exception.values[0].mechanism.data;

          if (summary.window.canReadFunctionName()) {
            assert.equal(fn, "setTimeout");
          } else {
            assert.equal(fn, "<anonymous>");
          }

          assert.deepEqual(summary.events[0].exception.values[0].mechanism, {
            type: "instrument",
            handled: true,
          });
        }
      });
    }
  );

  it(
    optional(
      "should capture built-in's handlers fn name in mechanism data",
      IS_LOADER
    ),
    function() {
      return runInSandbox(sandbox, function() {
        var div = document.createElement("div");
        document.body.appendChild(div);
        div.addEventListener(
          "click",
          function namedFunction() {
            foo();
          },
          false
        );
        var click = new MouseEvent("click");
        div.dispatchEvent(click);
      }).then(function(summary) {
        if (IS_LOADER) {
          // The async loader doesn't wrap addEventListener
          // so we don't receive the full mechanism
          assert.ok(summary.events[0].exception.values[0].mechanism);
        } else {
          var handler =
            summary.events[0].exception.values[0].mechanism.data.handler;
          delete summary.events[0].exception.values[0].mechanism.data.handler;
          var target =
            summary.events[0].exception.values[0].mechanism.data.target;
          delete summary.events[0].exception.values[0].mechanism.data.target;

          if (summary.window.canReadFunctionName()) {
            assert.equal(handler, "namedFunction");
          } else {
            assert.equal(handler, "<anonymous>");
          }

          // IE vs. Rest of the world
          assert.oneOf(target, ["Node", "EventTarget"]);
          assert.deepEqual(summary.events[0].exception.values[0].mechanism, {
            type: "instrument",
            handled: true,
            data: {
              function: "addEventListener",
            },
          });
        }
      });
    }
  );

  it(
    optional(
      "should fallback to <anonymous> fn name in mechanism data if one is unavailable",
      IS_LOADER
    ),
    function() {
      return runInSandbox(sandbox, function() {
        var div = document.createElement("div");
        document.body.appendChild(div);
        div.addEventListener(
          "click",
          function() {
            foo();
          },
          false
        );
        var click = new MouseEvent("click");
        div.dispatchEvent(click);
      }).then(function(summary) {
        if (IS_LOADER) {
          // The async loader doesn't wrap
          assert.ok(summary.events[0].exception.values[0].mechanism);
        } else {
          var target =
            summary.events[0].exception.values[0].mechanism.data.target;
          delete summary.events[0].exception.values[0].mechanism.data.target;

          // IE vs. Rest of the world
          assert.oneOf(target, ["Node", "EventTarget"]);
          assert.deepEqual(summary.events[0].exception.values[0].mechanism, {
            type: "instrument",
            handled: true,
            data: {
              function: "addEventListener",
              handler: "<anonymous>",
            },
          });
        }
      });
    }
  );
});
