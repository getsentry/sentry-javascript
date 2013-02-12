// Expose Raven to the world
window.Raven = Raven;

// AMD
if (isFunction(window.define) && define.amd) {
    // export Raven before we wrap
    define(function() { return Raven; });

    define = wrapArguments(define);
    if (isFunction(window.require)) {
        require = wrapArguments(require)
    };
}

})(window);
