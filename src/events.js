'use strict';

var isFunction = require('./utils').isFunction;

/**
 * Events mixin, inspired by Backbone events.
 *
 * Usage:
 *
 *  objectMerge(TargetObject.prototype, Events);
 *
 *  var obj = new TargetObject();
 *  obj.on('foo', function () { ... }); // add listener to 'foo' event
 *  obj.trigger('foo'); // calls all listeners bound to 'foo' event
 *  obj.off('foo'); // removes all listeners bound to 'foo'
 */
var Events = {
    on: function on(eventName, listener) {
        this._listeners = this._listeners || {};
        this._listeners[eventName] = this._listeners[eventName] || [];
        this._listeners[eventName].push(listener);
        return this;
    },

    off: function off(eventName, listener) {
        var _listeners = this._listeners && this._listeners[eventName];
        if (!_listeners)
            return this;

        if (listener) {
            for (var i = 0; i < _listeners.length; i++) {
                if (_listeners[i] === listener) {
                    this._listeners[eventName] = _listeners.slice(0, i).concat(_listeners.slice(i + 1));
                    break;
                }
            }
        } else {
            this._listeners[eventName] = [];
        }
        return this;
    },

    trigger: function trigger(eventName, arg1, arg2 /* , ... argN */) {
        var _listeners = this._listeners && this._listeners[eventName];
        if (!_listeners)
            return this;

        var listenerArgs = [].slice.call(arguments, 1);
        for (var i = 0; i < _listeners.length; i++) {
            if (isFunction(_listeners[i]))
                _listeners[i].apply(this, listenerArgs);
        }
        return this;
    }
};

module.exports = Events;
