// store references to original, unwrapped built-ins in order to:
// - get a clean, unwrapped setTimeout (so stack traces don't include
//   frames from mocha)
// - make assertions re: wrapped functions
window.originalBuiltIns = {
  setTimeout: setTimeout,
  setInterval: setInterval,
  requestAnimationFrame: requestAnimationFrame,
  xhrProtoOpen: XMLHttpRequest.prototype.open,
  headAddEventListener: document.head.addEventListener, // use <head> 'cause body isn't closed yet
  headRemoveEventListener: document.head.removeEventListener,
  consoleDebug: console.debug,
  consoleInfo: console.info,
  consoleWarn: console.warn,
  consoleError: console.error,
  consoleLog: console.log,
};

// expose events so we can access them in our tests
window.sentryData = [];
window.sentryBreadcrumbs = [];

// stub transport so we don't actually transmit any data
function DummyTransport() {}
DummyTransport.prototype.captureEvent = function(event) {
  // console.log(JSON.stringify(event, null, 2));
  sentryData.push(event);
  done(sentryData);
  return Promise.resolve({
    status: 'success',
  });
};

Sentry.init({
  dsn: 'https://public@example.com/1',
  attachStacktrace: true,
  transport: DummyTransport,
  beforeBreadcrumb: function(breadcrumb) {
    // Filter console logs as we use them for debugging *a lot* and they are not *that* important
    if (breadcrumb.category === 'console') {
      return null;
    }

    // overlyComplicatedDebuggingMechanism 'aka' console.log driven debugging
    // console.log(JSON.stringify(breadcrumb, null, 2));

    // Filter internal Karma requests
    if (
      breadcrumb.type === 'http' &&
      (breadcrumb.data.url.indexOf('test.js') !== -1 || breadcrumb.data.url.indexOf('frame.html') !== -1)
    ) {
      return null;
    }

    sentryBreadcrumbs.push(breadcrumb);

    return breadcrumb;
  },
});

function bar() {
  baz();
}

function foo() {
  bar();
}

function foo2() {
  // identical to foo, but meant for testing
  // different stack frame fns w/ same stack length
  bar();
}
