/**
 * requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel
 *
 * http://paulirish.com/2011/requestanimationframe-for-smart-animating/
 * http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
 *
 * MIT license
 */
(function() {
  var lastTime = 0;
  var vendors = ['ms', 'moz', 'webkit', 'o'];
  for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
    window.cancelAnimationFrame =
      window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
  }

  if (!window.requestAnimationFrame)
    window.requestAnimationFrame = function(callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(function() {
        callback(currTime + timeToCall);
      }, timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };

  if (!window.cancelAnimationFrame)
    window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
    };
})();

/**
 * DOM4 MouseEvent and KeyboardEvent Polyfills
 *
 * References:
 * https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/MouseEvent
 * https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/MouseEvent#Polyfill
 * https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/KeyboardEvent
 */
(function() {
  try {
    new MouseEvent('click');
    return false; // No need to polyfill
  } catch (e) {
    // Need to polyfill - fall through
  }

  var MouseEvent = function(eventType) {
    var mouseEvent = document.createEvent('MouseEvent');
    mouseEvent.initMouseEvent(eventType, true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    return mouseEvent;
  };

  MouseEvent.prototype = Event.prototype;
  window.MouseEvent = MouseEvent;
})();

(function() {
  try {
    new KeyboardEvent('keypress');
    return false; // No need to polyfill
  } catch (e) {
    // Need to polyfill - fall through
  }

  var KeyboardEvent = function(eventType) {
    var keyboardEvent = document.createEvent('KeyboardEvent');
    if (keyboardEvent.initKeyboardEvent)
      keyboardEvent.initKeyboardEvent(eventType, true, true, window, false, false, false, false, 'a', 0);
    if (keyboardEvent.initKeyEvent)
      keyboardEvent.initKeyEvent(eventType, true, true, window, false, false, false, false, 'a');
    return keyboardEvent;
  };

  KeyboardEvent.prototype = Event.prototype;
  window.KeyboardEvent = KeyboardEvent;
})();

(function() {
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
})();

function initSDK() {
  // stub transport so we don't actually transmit any data
  function DummyTransport() {}
  DummyTransport.prototype.sendEvent = function(event) {
    sentryData.push(event);
    done(sentryData);
    return Promise.resolve({
      status: 'success',
    });
  };

  Sentry.init({
    dsn: 'https://public@example.com/1',
    // debug: true,
    integrations: [new SentryIntegration.Dedupe()],
    attachStacktrace: true,
    transport: DummyTransport,
    ignoreErrors: ['ignoreErrorTest'],
    blacklistUrls: ['foo.js'],
    // integrations: function(old) {
    //   return [new Sentry.Integrations.Debug({ stringify: true })].concat(old);
    // },
    beforeBreadcrumb: function(breadcrumb) {
      // Filter console logs as we use them for debugging *a lot* and they are not *that* important
      // But allow then if we explicitly say so (for one of integration tests)
      if (breadcrumb.category === 'console' && !window.allowConsoleBreadcrumbs) {
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

      // Filter "refresh" like navigation which occurs in Mocha when testing on Android 4
      if (breadcrumb.category === 'navigation' && breadcrumb.data.to === breadcrumb.data.from) {
        return null;
      }

      sentryBreadcrumbs.push(breadcrumb);

      return breadcrumb;
    },
  });
}
