// Expose Raven to the world
if (typeof define === 'function' && define.amd) {
    // AMD
    define('raven', function(Raven) {
      return (window.Raven = Raven);
    });
} else if (typeof module === 'object') {
    // browserify
    module.exports = Raven;
} else if (typeof exports === 'object') {
    // CommonJS
    exports = Raven;
} else {
    // Everything else
    window.Raven = Raven;
}

})(window);
