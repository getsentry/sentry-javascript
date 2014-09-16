// Expose Raven to the world
if (typeof define === 'function' && define.amd) {
    // AMD
    define('raven', [], function() { return Raven; });
} else if (isObject(module)) {
    // CommonJS
    module.exports = Raven;
} else {
    // Everything else
    window.Raven = Raven;
}

})(window);
