/**
 * Backbone.js plugin
 *
 * Patches Backbone.Events callbacks.
 */
;(function(window, Raven, Backbone) {
'use strict';

// quit if Backbone isn't on the page
if (!Backbone) {
    return;
}

// We're too late to catch all of these by simply patching Backbone.Events.on
var affectedObjects = [
  Backbone.Events,
  Backbone,
  Backbone.Model.prototype,
  Backbone.Collection.prototype,
  Backbone.View.prototype,
  Backbone.Router.prototype,
  Backbone.History.prototype
];

for (var i = 0; i < affectedObjects.length; i++) {
  var affected = affectedObjects[i];

  var _oldOn = affected.on;
  affected.on = function BackboneEventsOn(name, callback, context) {
      var _callback;
      if (callback._callback) {
        _callback = callback._callback;
      } else {
        _callback = callback;
      }

      callback = Raven.wrap(callback);
      callback._callback = _callback;

      return _oldOn.call(this, name, callback, context);
  };

  affected.bind = affected.on;
}

}(this, Raven, window.Backbone));