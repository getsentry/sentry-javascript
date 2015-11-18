'use strict';

var Raven = require('./raven');

var _Raven = window.Raven;

var raven = new Raven();

/*
 * Allow multiple versions of Raven to be installed.
 * Strip Raven from the global context and returns the instance.
 *
 * @return {Raven}
 */
raven.noConflict = function () {
	window.Raven = _Raven;
	return raven;
};

raven.afterLoad();

module.exports = raven;