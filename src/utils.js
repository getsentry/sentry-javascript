'use strict';

var isError = require('iserror');

function isObject(what) {
    return typeof what === 'object' && what !== null;
}

module.exports = {
    isObject: isObject,
    isError: isError
};
