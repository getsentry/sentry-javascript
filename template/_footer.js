
// Expose Raven to the world
if (typeof define === 'function' && define.amd) {
    define(function() { return Raven; });
} else {
    window.Raven = Raven;
}

})(this);
