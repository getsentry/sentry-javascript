'use strict';
var Raven = require('../../');
var dsn = 'https://public:private@app.getsentry.com/269';

var nock = require('nock');
var scope = nock('https://app.getsentry.com')
  .filteringRequestBody(/.*/, '*')
  .post('/api/269/store/', '*')
  .reply(200, 'OK');

Raven.config(dsn).install();

process.on('exit', function() {
  scope.done();
  console.log('exit test assertions complete');
});

setImmediate(function() {
  throw new Error('derp');
});
