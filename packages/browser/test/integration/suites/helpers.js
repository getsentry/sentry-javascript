function evaluateInSandbox(sandbox, code) {
  // use setTimeout so stack trace doesn't go all the way back to mocha test runner
  sandbox &&
    sandbox.contentWindow &&
    sandbox.contentWindow.eval(
      "window.originalBuiltIns.setTimeout.call(window, " +
        code.toString() +
        ");"
    );
}

function runInSandbox(sandbox, options, code) {
  if (typeof options === "function") {
    code = options;
    options = {};
  }

  var resolveTest;
  var donePromise = new Promise(function(resolve) {
    resolveTest = resolve;
  });
  sandbox.contentWindow.resolveTest = function(summary) {
    clearTimeout(lastResort);
    resolveTest(summary);
  };

  // If by some unexplainable way we reach the timeout limit, try to finalize the test and pray for the best
  // NOTE: 5000 so it's easier to grep for all timeout instances (shell.js, loader-specific.js and here)
  var lastResort = setTimeout(function() {
    var force = function() {
      window.resolveTest({
        events: events,
        breadcrumbs: breadcrumbs,
        window: window,
      });
    };
    if (sandbox) {
      evaluateInSandbox(sandbox, force.toString());
    }
  }, 5000 - 500);

  var finalize = function() {
    var summary = {
      events: events,
      eventHints: eventHints,
      breadcrumbs: breadcrumbs,
      breadcrumbHints: breadcrumbHints,
      window: window,
    };

    Sentry.onLoad(function() {
      setTimeout(function() {
        Sentry.flush()
          .then(function() {
            window.resolveTest(summary);
          })
          .catch(function() {
            window.resolveTest(summary);
          });
      });
    });
  };

  sandbox.contentWindow.finalizeManualTest = function() {
    evaluateInSandbox(sandbox, finalize.toString());
  };

  evaluateInSandbox(sandbox, code.toString());

  if (!options.manual) {
    evaluateInSandbox(sandbox, finalize.toString());
  }

  return donePromise;
}

function createSandbox(done, file) {
  var sandbox = document.createElement("iframe");
  sandbox.style.display = "none";
  sandbox.src = "/base/variants/" + file + ".html";
  sandbox.onload = function() {
    done();
  };
  document.body.appendChild(sandbox);
  return sandbox;
}

function optional(title, condition) {
  return condition ? "⚠ SKIPPED: " + title : title;
}
