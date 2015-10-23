/**
 * Ember.js plugin
 *
 * Patches event handler callbacks and ajax callbacks.
 */
;(function(window) {
'use strict';

if (window.Raven) Raven.addPlugin(function EmberPlugin() {

var Ember = window.Ember;

// quit if Ember isn't on the page
if (!Ember) return;

var _oldOnError = Ember.onerror;
Ember.onerror = function EmberOnError(error) {
    Raven.captureException(error);
    if (typeof _oldOnError === 'function') {
        _oldOnError.call(this, error);
    }
};
Ember.RSVP.on('error', function (reason) {
    if (reason instanceof Error) {
        Raven.captureException(reason, {extra: {context: 'Unhandled Promise error detected'}});
    } else {
        Raven.captureMessage('Unhandled Promise error detected', {extra: {reason: reason}});
    }
});

// End of plugin factory
});

}(typeof window !== 'undefined' ? window : this));
