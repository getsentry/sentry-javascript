// Expose Raven to the world
if (typeof define === 'function' && define.amd) {
    // AMD
    define('raven', function(Raven) {
      return (window.Raven = Raven);
    });
} else if (isObject(module)) {
    // browserify
    module.exports = Raven;
} else if (isObject(exports)) {
    // CommonJS
    exports = Raven;
} else {
    // Everything else
    window.Raven = Raven;
}

})(window);
