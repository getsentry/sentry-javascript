// This is being exposed no matter what because there are too many weird
// usecases for how people use Raven. If this is really a problem, I'm sorry.
window.Raven = Raven;

// Expose Raven to the world
if (typeof define === 'function' && define.amd) {
    // AMD
    define('raven', [], function() {
      return Raven;
    });
} else if (typeof module === 'object') {
    // browserify
    module.exports = Raven;
} else if (typeof exports === 'object') {
    // CommonJS
    exports = Raven;
}

})(typeof window !== 'undefined' ? window : this);
