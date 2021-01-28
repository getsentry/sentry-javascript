describe("breadcrumbs", function() {
  it(
    optional("should record an XMLHttpRequest with a handler", IS_LOADER),
    function() {
      return runInSandbox(sandbox, { manual: true }, function() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/base/subjects/example.json");
        xhr.onreadystatechange = function() {};
        xhr.send();
        waitForXHR(xhr, function() {
          Sentry.captureMessage("test");
          window.finalizeManualTest();
        });
      }).then(function(summary) {
        // The async loader doesn't wrap XHR
        if (IS_LOADER) {
          return;
        }
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].type, "http");
        assert.equal(summary.breadcrumbs[0].category, "xhr");
        assert.equal(summary.breadcrumbs[0].data.method, "GET");
      });
    }
  );

  it(
    optional(
      "should record an XMLHttpRequest with a handler attached after send was called",
      IS_LOADER
    ),
    function() {
      return runInSandbox(sandbox, { manual: true }, function() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/base/subjects/example.json");
        xhr.send();
        xhr.onreadystatechange = function() {
          window.handlerCalled = true;
        };
        waitForXHR(xhr, function() {
          Sentry.captureMessage("test");
          window.finalizeManualTest();
        });
      }).then(function(summary) {
        // The async loader doesn't wrap XHR
        if (IS_LOADER) {
          return;
        }
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].type, "http");
        assert.equal(summary.breadcrumbs[0].category, "xhr");
        assert.equal(summary.breadcrumbs[0].data.method, "GET");
        assert.typeOf(summary.breadcrumbs[0].timestamp, "number");
        assert.isTrue(summary.window.handlerCalled);
        delete summary.window.handlerCalled;
      });
    }
  );

  it(
    optional(
      "should record an XMLHttpRequest without any handlers set",
      IS_LOADER
    ),
    function() {
      return runInSandbox(sandbox, { manual: true }, function() {
        var xhr = new XMLHttpRequest();
        xhr.open("get", "/base/subjects/example.json");
        xhr.send();
        waitForXHR(xhr, function() {
          Sentry.captureMessage("test");
          window.finalizeManualTest();
        });
      }).then(function(summary) {
        // The async loader doesn't wrap XHR
        if (IS_LOADER) {
          return;
        }
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].type, "http");
        assert.equal(summary.breadcrumbs[0].category, "xhr");
        assert.equal(summary.breadcrumbs[0].data.method, "GET");
        assert.isUndefined(summary.breadcrumbs[0].data.input);
        // To make sure that we are not providing this key for non-post requests
        assert.equal(summary.breadcrumbHints[0].input, undefined);
      });
    }
  );

  it(
    optional(
      "should give access to request body for XMLHttpRequest POST requests",
      IS_LOADER
    ),
    function() {
      return runInSandbox(sandbox, { manual: true }, function() {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/base/subjects/example.json");
        xhr.send('{"foo":"bar"}');
        waitForXHR(xhr, function() {
          Sentry.captureMessage("test");
          window.finalizeManualTest();
        });
      }).then(function(summary) {
        // The async loader doesn't wrap XHR
        if (IS_LOADER) {
          return;
        }
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].type, "http");
        assert.equal(summary.breadcrumbs[0].category, "xhr");
        assert.equal(summary.breadcrumbs[0].data.method, "POST");
        assert.isUndefined(summary.breadcrumbs[0].data.input);
        assert.equal(summary.breadcrumbHints[0].input, '{"foo":"bar"}');
      });
    }
  );

  it("should record a fetch request", function() {
    return runInSandbox(sandbox, { manual: true }, function() {
      fetch("/base/subjects/example.json", {
        method: "Get",
      })
        .then(
          function() {
            Sentry.captureMessage("test");
          },
          function() {
            Sentry.captureMessage("test");
          }
        )
        .then(function() {
          window.finalizeManualTest();
        })
        .catch(function() {
          window.finalizeManualTest();
        });
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap fetch, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        if (summary.window.supportsNativeFetch()) {
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, "http");
          assert.equal(summary.breadcrumbs[0].category, "fetch");
          assert.equal(summary.breadcrumbs[0].data.method, "GET");
          assert.equal(
            summary.breadcrumbs[0].data.url,
            "/base/subjects/example.json"
          );
        } else {
          // otherwise we use a fetch polyfill based on xhr
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, "http");
          assert.equal(summary.breadcrumbs[0].category, "xhr");
          assert.equal(summary.breadcrumbs[0].data.method, "GET");
          assert.equal(
            summary.breadcrumbs[0].data.url,
            "/base/subjects/example.json"
          );
        }
      }
    });
  });

  it("should record a fetch request with Request obj instead of URL string", function() {
    return runInSandbox(sandbox, { manual: true }, function() {
      fetch(new Request("/base/subjects/example.json"))
        .then(
          function() {
            Sentry.captureMessage("test");
          },
          function() {
            Sentry.captureMessage("test");
          }
        )
        .then(function() {
          window.finalizeManualTest();
        })
        .catch(function() {
          window.finalizeManualTest();
        });
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap fetch, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        if (summary.window.supportsNativeFetch()) {
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, "http");
          assert.equal(summary.breadcrumbs[0].category, "fetch");
          assert.equal(summary.breadcrumbs[0].data.method, "GET");
          // Request constructor normalizes the url
          assert.ok(
            summary.breadcrumbs[0].data.url.indexOf(
              "/base/subjects/example.json"
            ) !== -1
          );
        } else {
          // otherwise we use a fetch polyfill based on xhr
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, "http");
          assert.equal(summary.breadcrumbs[0].category, "xhr");
          assert.equal(summary.breadcrumbs[0].data.method, "GET");
          assert.ok(
            summary.breadcrumbs[0].data.url.indexOf(
              "/base/subjects/example.json"
            ) !== -1
          );
        }
      }
    });
  });

  it("should record a fetch request with an arbitrary type argument", function() {
    return runInSandbox(sandbox, { manual: true }, function() {
      fetch(123)
        .then(
          function() {
            Sentry.captureMessage("test");
          },
          function() {
            Sentry.captureMessage("test");
          }
        )
        .then(function() {
          window.finalizeManualTest();
        })
        .catch(function() {
          window.finalizeManualTest();
        });
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap fetch, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        if (summary.window.supportsNativeFetch()) {
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, "http");
          assert.equal(summary.breadcrumbs[0].category, "fetch");
          assert.equal(summary.breadcrumbs[0].data.method, "GET");
          assert.ok(summary.breadcrumbs[0].data.url.indexOf("123") !== -1);
        } else {
          // otherwise we use a fetch polyfill based on xhr
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, "http");
          assert.equal(summary.breadcrumbs[0].category, "xhr");
          assert.equal(summary.breadcrumbs[0].data.method, "GET");
          assert.ok(summary.breadcrumbs[0].data.url.indexOf("123") !== -1);
        }
      }
    });
  });

  it("should provide a hint for dom events that includes event name and event itself", function() {
    return runInSandbox(sandbox, function() {
      var input = document.getElementsByTagName("input")[0];
      var clickHandler = function() {};
      input.addEventListener("click", clickHandler);
      var click = new MouseEvent("click");
      input.dispatchEvent(click);
      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbHints.length, 1);
        assert.equal(summary.breadcrumbHints[0].name, "click");
        assert.equal(summary.breadcrumbHints[0].event.target.tagName, "INPUT");
        // There should be no expection, if there is one it means we threw it
        assert.isUndefined(summary.events[0].exception);
      }
    });
  });

  it("should not fail with click or keypress handler with no callback", function() {
    return runInSandbox(sandbox, function() {
      var input = document.getElementsByTagName("input")[0];
      input.addEventListener("click", undefined);
      input.addEventListener("keypress", undefined);

      var click = new MouseEvent("click");
      input.dispatchEvent(click);

      var keypress = new KeyboardEvent("keypress");
      input.dispatchEvent(keypress);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 2);

        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );

        assert.equal(summary.breadcrumbs[1].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[1].message,
          'body > form#foo-form > input[name="foo"]'
        );

        // There should be no expection, if there is one it means we threw it
        assert.isUndefined(summary.events[0].exception);
      }
    });
  });

  it("should not fail with custom event", function() {
    return runInSandbox(sandbox, function() {
      var input = document.getElementsByTagName("input")[0];
      input.addEventListener("build", function(evt) {
        evt.stopPropagation();
      });

      var customEvent = new CustomEvent("build", { detail: 1 });
      input.dispatchEvent(customEvent);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // There should be no expection, if there is one it means we threw it
        assert.isUndefined(summary.events[0].exception);
        assert.equal(summary.breadcrumbs.length, 0);
      }
    });
  });

  it("should not fail with custom event and handler with no callback", function() {
    return runInSandbox(sandbox, function() {
      var input = document.getElementsByTagName("input")[0];
      input.addEventListener("build", undefined);

      var customEvent = new CustomEvent("build", { detail: 1 });
      input.dispatchEvent(customEvent);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // There should be no expection, if there is one it means we threw it
        assert.isUndefined(summary.events[0].exception);
        assert.equal(summary.breadcrumbs.length, 0);
      }
    });
  });

  it("should record a mouse click on element WITH click handler present", function() {
    return runInSandbox(sandbox, function() {
      // add an event listener to the input. we want to make sure that
      // our breadcrumbs still work even if the page has an event listener
      // on an element that cancels event bubbling
      var input = document.getElementsByTagName("input")[0];
      var clickHandler = function(evt) {
        evt.stopPropagation(); // don't bubble
      };
      input.addEventListener("click", clickHandler);

      // click <input/>
      var click = new MouseEvent("click");
      input.dispatchEvent(click);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
      }
    });
  });

  it("should record a mouse click on element WITHOUT click handler present", function() {
    return runInSandbox(sandbox, function() {
      // click <input/>
      var click = new MouseEvent("click");
      var input = document.getElementsByTagName("input")[0];
      input.dispatchEvent(click);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
      }
    });
  });

  it("should only record a SINGLE mouse click for a tree of elements with event listeners", function() {
    return runInSandbox(sandbox, function() {
      var clickHandler = function() {};

      // mousemove event shouldnt clobber subsequent "breadcrumbed" events (see #724)
      document.querySelector(".a").addEventListener("mousemove", clickHandler);

      document.querySelector(".a").addEventListener("click", clickHandler);
      document.querySelector(".b").addEventListener("click", clickHandler);
      document.querySelector(".c").addEventListener("click", clickHandler);

      // click <input/>
      var click = new MouseEvent("click");
      var input = document.querySelector(".a"); // leaf node
      input.dispatchEvent(click);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[0].message,
          "body > div.c > div.b > div.a"
        );
      }
    });
  });

  it("should bail out if accessing the `target` property of an event throws an exception", function() {
    // see: https://github.com/getsentry/sentry-javascript/issues/768
    return runInSandbox(sandbox, function() {
      // click <input/>
      var click = new MouseEvent("click");
      function kaboom() {
        throw new Error("lol");
      }
      Object.defineProperty(click, "target", { get: kaboom });

      var input = document.querySelector(".a"); // leaf node

      Sentry.captureMessage("test");
      input.dispatchEvent(click);
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(summary.breadcrumbs[0].message, "<unknown>");
      }
    });
  });

  it('should record consecutive keypress events into a single "input" breadcrumb', function() {
    return runInSandbox(sandbox, function() {
      // keypress <input/> twice
      var keypress1 = new KeyboardEvent("keypress");
      var keypress2 = new KeyboardEvent("keypress");

      var input = document.getElementsByTagName("input")[0];
      input.dispatchEvent(keypress1);
      input.dispatchEvent(keypress2);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
      }
    });
  });

  it("should correctly capture multiple consecutive breadcrumbs if they are of different type", function() {
    return runInSandbox(sandbox, function() {
      var input = document.getElementsByTagName("input")[0];

      var clickHandler = function() {};
      input.addEventListener("click", clickHandler);
      var keypressHandler = function() {};
      input.addEventListener("keypress", keypressHandler);

      input.dispatchEvent(new MouseEvent("click"));
      input.dispatchEvent(new KeyboardEvent("keypress"));

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // Breadcrumb should be captured by the global event listeners, not a specific one
        assert.equal(summary.breadcrumbs.length, 2);
        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
        assert.equal(summary.breadcrumbs[1].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
        assert.equal(summary.breadcrumbHints[0].global, false);
        assert.equal(summary.breadcrumbHints[1].global, false);
        assert.isUndefined(summary.events[0].exception);
      }
    });
  });

  it("should debounce multiple consecutive identical breadcrumbs but allow for switching to a different type", function() {
    return runInSandbox(sandbox, function() {
      var input = document.getElementsByTagName("input")[0];

      var clickHandler = function() {};
      input.addEventListener("click", clickHandler);
      var keypressHandler = function() {};
      input.addEventListener("keypress", keypressHandler);

      input.dispatchEvent(new MouseEvent("click"));
      input.dispatchEvent(new MouseEvent("click"));
      input.dispatchEvent(new MouseEvent("click"));
      input.dispatchEvent(new KeyboardEvent("keypress"));
      input.dispatchEvent(new KeyboardEvent("keypress"));
      input.dispatchEvent(new KeyboardEvent("keypress"));

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // Breadcrumb should be captured by the global event listeners, not a specific one
        assert.equal(summary.breadcrumbs.length, 2);
        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
        assert.equal(summary.breadcrumbs[1].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
        assert.equal(summary.breadcrumbHints[0].global, false);
        assert.equal(summary.breadcrumbHints[1].global, false);
        assert.isUndefined(summary.events[0].exception);
      }
    });
  });

  it("should debounce multiple consecutive identical breadcrumbs but allow for switching to a different target", function() {
    return runInSandbox(sandbox, function() {
      var input = document.querySelector("#foo-form input");
      var div = document.querySelector("#foo-form div");

      var clickHandler = function() {};
      input.addEventListener("click", clickHandler);
      div.addEventListener("click", clickHandler);

      input.dispatchEvent(new MouseEvent("click"));
      div.dispatchEvent(new MouseEvent("click"));

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // Breadcrumb should be captured by the global event listeners, not a specific one
        assert.equal(summary.breadcrumbs.length, 2);
        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
        assert.equal(summary.breadcrumbs[1].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[1].message,
          "body > form#foo-form > div.contenteditable"
        );
        assert.equal(summary.breadcrumbHints[0].global, false);
        assert.equal(summary.breadcrumbHints[1].global, false);
        assert.isUndefined(summary.events[0].exception);
      }
    });
  });

  it(
    optional(
      "should flush keypress breadcrumbs when an error is thrown",
      IS_LOADER
    ),
    function() {
      return runInSandbox(sandbox, function() {
        // keypress <input/>
        var keypress = new KeyboardEvent("keypress");
        var input = document.getElementsByTagName("input")[0];
        input.dispatchEvent(keypress);
        foo(); // throw exception
      }).then(function(summary) {
        if (IS_LOADER) {
          return;
        }
        // TODO: don't really understand what's going on here
        // Why do we not catch an error here

        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );
      });
    }
  );

  it("should flush keypress breadcrumb when input event occurs immediately after", function() {
    return runInSandbox(sandbox, function() {
      // 1st keypress <input/>
      var keypress1 = new KeyboardEvent("keypress");
      // click <input/>
      var click = new MouseEvent("click");
      // 2nd keypress
      var keypress2 = new KeyboardEvent("keypress");

      var input = document.getElementsByTagName("input")[0];
      input.dispatchEvent(keypress1);
      input.dispatchEvent(click);
      input.dispatchEvent(keypress2);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 3);

        assert.equal(summary.breadcrumbs[0].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );

        assert.equal(summary.breadcrumbs[1].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[1].message,
          'body > form#foo-form > input[name="foo"]'
        );

        assert.equal(summary.breadcrumbs[2].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[2].message,
          'body > form#foo-form > input[name="foo"]'
        );
      }
    });
  });

  it('should record consecutive keypress events in a contenteditable into a single "input" breadcrumb', function() {
    return runInSandbox(sandbox, function() {
      // keypress <input/> twice
      var keypress1 = new KeyboardEvent("keypress");
      var keypress2 = new KeyboardEvent("keypress");

      var div = document.querySelector("[contenteditable]");
      div.dispatchEvent(keypress1);
      div.dispatchEvent(keypress2);

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[0].message,
          "body > form#foo-form > div.contenteditable"
        );
      }
    });
  });

  it("should record click events that were handled using an object with handleEvent property and call original callback", function() {
    return runInSandbox(sandbox, function() {
      window.handleEventCalled = false;

      var input = document.getElementsByTagName("input")[0];
      input.addEventListener("click", {
        handleEvent: function() {
          window.handleEventCalled = true;
        },
      });
      input.dispatchEvent(new MouseEvent("click"));

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].category, "ui.click");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );

        assert.equal(summary.window.handleEventCalled, true);
      }
    });
  });

  it("should record keypress events that were handled using an object with handleEvent property and call original callback", function() {
    return runInSandbox(sandbox, function() {
      window.handleEventCalled = false;

      var input = document.getElementsByTagName("input")[0];
      input.addEventListener("keypress", {
        handleEvent: function() {
          window.handleEventCalled = true;
        },
      });
      input.dispatchEvent(new KeyboardEvent("keypress"));

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].category, "ui.input");
        assert.equal(
          summary.breadcrumbs[0].message,
          'body > form#foo-form > input[name="foo"]'
        );

        assert.equal(summary.window.handleEventCalled, true);
      }
    });
  });

  it("should remove breadcrumb instrumentation when all event listeners are detached", function() {
    return runInSandbox(sandbox, function() {
      var input = document.getElementsByTagName("input")[0];

      var clickHandler = function() {};
      var otherClickHandler = function() {};
      input.addEventListener("click", clickHandler);
      input.addEventListener("click", otherClickHandler);
      input.removeEventListener("click", clickHandler);
      input.removeEventListener("click", otherClickHandler);

      var keypressHandler = function() {};
      var otherKeypressHandler = function() {};
      input.addEventListener("keypress", keypressHandler);
      input.addEventListener("keypress", otherKeypressHandler);
      input.removeEventListener("keypress", keypressHandler);
      input.removeEventListener("keypress", otherKeypressHandler);

      input.dispatchEvent(new MouseEvent("click"));
      input.dispatchEvent(new KeyboardEvent("keypress"));

      Sentry.captureMessage("test");
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // Breadcrumb should be captured by the global event listeners, not a specific one
        assert.equal(summary.breadcrumbs.length, 2);
        assert.equal(summary.breadcrumbHints[0].global, true);
        assert.equal(summary.breadcrumbHints[1].global, true);
        assert.isUndefined(summary.events[0].exception);
      }
    });
  });

  it(
    optional(
      "should record history.[pushState|replaceState] changes as navigation breadcrumbs",
      IS_LOADER
    ),
    function() {
      return runInSandbox(sandbox, function() {
        history.pushState({}, "", "/foo");
        history.pushState({}, "", "/bar?a=1#fragment");
        history.pushState({}, "", {}); // pushState calls toString on non-string args
        history.pushState({}, "", null); // does nothing / no-op
        // can't call history.back() because it will change url of parent document
        // (e.g. document running mocha) ... instead just "emulate" a back button
        // press by calling replaceState
        history.replaceState({}, "", "/bar?a=1#fragment");
        Sentry.captureMessage("test");
      }).then(function(summary) {
        if (IS_LOADER) {
          // The async loader doesn't wrap history
          return;
        }
        assert.equal(summary.breadcrumbs.length, 4);
        assert.equal(summary.breadcrumbs[0].category, "navigation"); // (start) => foo
        assert.equal(summary.breadcrumbs[1].category, "navigation"); // foo => bar?a=1#fragment
        assert.equal(summary.breadcrumbs[2].category, "navigation"); // bar?a=1#fragment => [object%20Object]
        assert.equal(summary.breadcrumbs[3].category, "navigation"); // [object%20Object] => bar?a=1#fragment (back button)

        assert.ok(
          /\/base\/variants\/.*\.html$/.test(summary.breadcrumbs[0].data.from),
          "'from' url is incorrect"
        );
        assert.ok(
          /\/foo$/.test(summary.breadcrumbs[0].data.to),
          "'to' url is incorrect"
        );

        assert.ok(
          /\/foo$/.test(summary.breadcrumbs[1].data.from),
          "'from' url is incorrect"
        );
        assert.ok(
          /\/bar\?a=1#fragment$/.test(summary.breadcrumbs[1].data.to),
          "'to' url is incorrect"
        );

        assert.ok(
          /\/bar\?a=1#fragment$/.test(summary.breadcrumbs[2].data.from),
          "'from' url is incorrect"
        );
        assert.ok(
          /\[object Object\]$/.test(summary.breadcrumbs[2].data.to),
          "'to' url is incorrect"
        );

        assert.ok(
          /\[object Object\]$/.test(summary.breadcrumbs[3].data.from),
          "'from' url is incorrect"
        );
        assert.ok(
          /\/bar\?a=1#fragment/.test(summary.breadcrumbs[3].data.to),
          "'to' url is incorrect"
        );
      });
    }
  );

  it(
    optional("should preserve native code detection compatibility", IS_LOADER),
    function() {
      return runInSandbox(sandbox, { manual: true }, function() {
        window.resolveTest();
      }).then(function() {
        if (IS_LOADER) {
          // The async loader doesn't wrap anything
          return;
        }
        assert.include(
          Function.prototype.toString.call(window.setTimeout),
          "[native code]"
        );
        assert.include(
          Function.prototype.toString.call(window.setInterval),
          "[native code]"
        );
        assert.include(
          Function.prototype.toString.call(window.addEventListener),
          "[native code]"
        );
        assert.include(
          Function.prototype.toString.call(window.removeEventListener),
          "[native code]"
        );
        assert.include(
          Function.prototype.toString.call(window.requestAnimationFrame),
          "[native code]"
        );
        if ("fetch" in window) {
          assert.include(
            Function.prototype.toString.call(window.fetch),
            "[native code]"
          );
        }
      });
    }
  );

  it("should capture console breadcrumbs", function() {
    return runInSandbox(sandbox, { manual: true }, function() {
      window.allowConsoleBreadcrumbs = true;
      var logs = document.createElement("script");
      logs.src = "/base/subjects/console-logs.js";
      logs.onload = function() {
        window.finalizeManualTest();
      };
      document.head.appendChild(logs);
    }).then(function(summary) {
      if (IS_LOADER) {
        // The async loader doesn't capture breadcrumbs, but we should receive the event without them
        assert.lengthOf(summary.events, 1);
      } else {
        if ("assert" in console) {
          assert.lengthOf(summary.breadcrumbs, 4);
          assert.deepEqual(summary.breadcrumbs[3].data.arguments, [
            "math broke",
          ]);
        } else {
          assert.lengthOf(summary.breadcrumbs, 3);
        }

        assert.deepEqual(summary.breadcrumbs[0].data.arguments, ["One"]);
        assert.deepEqual(summary.breadcrumbs[1].data.arguments, [
          "Two",
          { a: 1 },
        ]);
        assert.deepEqual(summary.breadcrumbs[2].data.arguments, [
          "Error 2",
          { b: { c: [] } },
        ]);
      }
    });
  });
});
