'use strict';

function isObject(what) {
    return typeof what === 'object' && what !== null;
}

// Sorta yanked from https://github.com/joyent/node/blob/aa3b4b4/lib/util.js#L560
// with some tiny modifications
function isError(what) {
    var toString = {}.toString.call(what);
    return isObject(what) &&
        toString === '[object Error]' ||
        toString === '[object Exception]' || // Firefox NS_ERROR_FAILURE Exceptions
        what instanceof Error;
}

module.exports = {
    isObject: isObject,
    isError: isError
};