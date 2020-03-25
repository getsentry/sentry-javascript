'use strict';
var Raven = require('../../');
var assert = require('assert');
var dsn = 'https://public:private@app.getsentry.com/269';

var nock = require('nock');
var scope = nock('https://app.getsentry.com')
  .filteringRequestBody(/.*/, '*')
  .post('/api/269/store/', '*')
  .reply(200, 'OK');

Raven.config(dsn).install();

var uncaughts = 0;
process.on('uncaughtException', function() {
  uncaughts++;
});

process.on('exit', function() {
  scope.done();
  assert.equal(uncaughts, 2);
  console.log('exit test assertions complete');
});

setImmediate(function() {
  setImmediate(function() {
    throw new Error('herp');
  });
  throw new Error('derp');
});
