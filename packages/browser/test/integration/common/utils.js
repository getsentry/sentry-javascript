// All the functions below can be called within the iframe under the test

function supportsFetch() {
  if (!("fetch" in window)) {
    return false;
  }

  try {
    new Headers();
    new Request("");
    new Response();
    return true;
  } catch (e) {
    return false;
  }
}

function supportsNativeFetch() {
  if (!supportsFetch()) {
    return false;
  }

  function isNativeFunc(func) {
    return func.toString().indexOf("native") !== -1;
  }

  var result = null;
  if (window.document) {
    var sandbox = window.document.createElement("iframe");
    sandbox.hidden = true;
    try {
      window.document.head.appendChild(sandbox);
      if (sandbox.contentWindow && sandbox.contentWindow.fetch) {
        result = isNativeFunc(sandbox.contentWindow.fetch);
      }
      window.document.head.removeChild(sandbox);
    } catch (o_O) {}
  }

  if (result === null) {
    result = isNativeFunc(window.fetch);
  }

  return result;
}

function isChrome() {
  return (
    /Chrome/.test(navigator.userAgent) &&
    /Google Inc/.test(navigator.vendor) &&
    !/Android/.test(navigator.userAgent)
  );
}

function isBelowIE11() {
  return /*@cc_on!@*/ false == !false;
}

// Thanks for nothing IE!
// (╯°□°）╯︵ ┻━┻
function canReadFunctionName() {
  function foo() {}
  if (foo.name === "foo") return true;
  return false;
}

function waitForXHR(xhr, cb) {
  if (xhr.readyState === 4) {
    return cb();
  }

  setTimeout(function() {
    waitForXHR(xhr, cb);
  }, 1000 / 60);
}
