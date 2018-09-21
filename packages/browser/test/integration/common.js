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
