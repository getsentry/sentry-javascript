// store references to original, unwrapped built-ins in order to:
// - get a clean, unwrapped setTimeout (so stack traces don't include frames from mocha)
// - make assertions re: wrapped functions
var originalBuiltIns = {
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

var events = [];
var breadcrumbs = [];

// Oh dear IE10...
var dsn =
  document.location.protocol +
  "//public@" +
  document.location.hostname +
  (document.location.port ? ":" + document.location.port : "") +
  "/1";

function initSDK() {
  Sentry.init({
    dsn: dsn,
    integrations: [new Sentry.Integrations.Dedupe()],
    attachStacktrace: true,
    ignoreErrors: ["ignoreErrorTest"],
    blacklistUrls: ["foo.js"],
    beforeSend: function(event) {
      events.push(event);
      return event;
    },
    beforeBreadcrumb: function(breadcrumb) {
      // Filter console logs as we use them for debugging *a lot* and they are not *that* important
      // But allow then if we explicitly say so (for one of integration tests)
      if (
        breadcrumb.category === "console" &&
        !window.allowConsoleBreadcrumbs
      ) {
        return null;
      }

      // One of the tests use manually created breadcrumb without eventId and we want to let it through
      if (breadcrumb.category.indexOf("sentry" === 0) && breadcrumb.event_id) {
        return null;
      }

      if (
        breadcrumb.type === "http" &&
        (breadcrumb.data.url.indexOf("test.js") !== -1 ||
          breadcrumb.data.url.indexOf("frame.html") !== -1)
      ) {
        return null;
      }

      // Filter "refresh" like navigation which occurs in Mocha when testing on Android 4
      if (
        breadcrumb.category === "navigation" &&
        breadcrumb.data.to === breadcrumb.data.from
      ) {
        return null;
      }

      breadcrumbs.push(breadcrumb);
      return breadcrumb;
    },
  });
}
