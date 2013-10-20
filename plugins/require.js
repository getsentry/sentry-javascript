;(function(window, Raven) {
    "use strict";

    if (typeof define === 'function' && define.amd) {
        window.define = Raven.wrapArguments(define);
        window.require = Raven.wrapArguments(require);
    }
}(this, Raven));
