// Expose Raven to the world
if (typeof define === 'function' && define.amd) {
    // AMD
    define('raven', [], function() { return Raven; });
} else if (typeof module === 'object') {
    // CommonJS
    module.exports = Raven;
} else {
    // Everything else
    window.Raven = Raven;
}

})(window);
