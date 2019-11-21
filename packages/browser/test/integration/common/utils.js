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

  return /^function fetch\(\)\s+\{\s+\[native code\]\s+\}$/.test(window.fetch.toString());
}

function supportsOnunhandledRejection() {
  return typeof PromiseRejectionEvent !== "undefined";
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
