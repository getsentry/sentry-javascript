'use strict';

var Raven = require('./raven');

var raven = new Raven();
raven.afterLoad();

module.exports = raven;