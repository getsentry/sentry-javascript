'use strict';
var Raven = require('../../');
// We never actually report any errors, just getting Raven to play ball
var sentryDsn = 'https://fake:dsn@app.getsentry.com/12345';

Raven.disableConsoleAlerts();
Raven.config(sentryDsn, {
  autoBreadcrumbs: {
    console: false,
    http: true,
  }
}).install();
process.removeAllListeners('uncaughtException');

var testModulePath = process.argv[process.argv.length - 1];
require(testModulePath);
