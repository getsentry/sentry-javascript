/**
 * require.js plugin
 *
 * Automatically wrap define/require callbacks. (Experimental)
 */
;(function(window) {
'use strict';

if (window.Raven) Raven.addPlugin(function RequirePlugin() {

if (typeof define === 'function' && define.amd) {
    window.define = Raven.wrap({deep: false}, define);
    window.require = Raven.wrap({deep: false}, require);
}

// End of plugin factory
});

}(window));
