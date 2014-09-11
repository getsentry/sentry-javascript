if (typeof define === 'function' && define.amd) {
    // AMD
    define('raven', [], function() { return Raven; });
} else if (typeof exports !== 'undefined') {
    // CommonJS
    module.exports = Raven;
} else {
    // Everything else
    window.Raven = Raven;
}

})(window);
