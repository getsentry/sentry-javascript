'use strict';

module.exports = require('./lib/client');
module.exports.utils = require('./lib/utils');
module.exports.middleware = {
  connect: require('./lib/middleware/connect')
};
// friendly alias for "raven.middleware.express"
module.exports.middleware.express = module.exports.middleware.connect;
module.exports.transports = require('./lib/transports');
module.exports.parsers = require('./lib/parsers');

// To infinity and beyond
Error.stackTraceLimit = Infinity;
