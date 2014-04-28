
// AMD
if (typeof define === 'function' && define.amd) {
    define('raven', [], function() { return Raven; });
}
else if (typeof module == 'object') {
    module.exports = Raven;
}
else {
    // Expose Raven to the world
    window.Raven = Raven;  
}
})(this);
