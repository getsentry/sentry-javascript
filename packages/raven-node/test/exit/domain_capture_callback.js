'use strict';
var Raven = require('../../');
var assert = require('assert');
var dsn = 'https://public:private@app.getsentry.com/269';

var nock = require('nock');
var scope = nock('https://app.getsentry.com')
  .filteringRequestBody(/.*/, '*')
  .post('/api/269/store/', '*')
  .reply(200, 'OK');

Raven.config(dsn).install(function(err, sendErr, eventId) {
  scope.done();
  assert.equal(sendErr, null);
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'derp');
  console.log('exit test assertions complete');
  process.exit(20);
});

Raven.context(function() {
  setImmediate(function() {
    throw new Error('derp');
  });
});
