
// Expose Raven to the world
window.Raven = Raven;

// AMD
if (typeof define === 'function' && define.amd) {
    // export Raven before we wrap
    define(function() { return Raven; });

    define = wrapArguments(define);
    require = wrapArguments(require);
}

})(window);
