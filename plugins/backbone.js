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

function makeBackboneEventsOn(oldOn) {
  return function BackboneEventsOn(name, callback, context) {
    var _callback = callback._callback || callback;
    callback = Raven.wrap(callback);
    callback._callback = _callback;
    return oldOn.call(this, name, callback, context);
  };
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
], i = 0, l = affectedObjects.length;

for (; i < l; i++) {
  var affected = affectedObjects[i];
  affected.on = makeBackboneEventsOn(affected.on);
  affected.bind = affected.on;
}

}(this, Raven, window.Backbone));
