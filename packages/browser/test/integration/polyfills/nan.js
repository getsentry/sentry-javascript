/**
 * Number.isNan Polyfill
 *
 * References:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isNaN
 */

(function() {
  if (typeof Number.isNaN !== "function") {
    Number.isNaN = function(value) {
      return value !== value;
    };
  }
})();
