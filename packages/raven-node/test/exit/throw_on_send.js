'use strict';
var Raven = require('../../');
var assert = require('assert');
var dsn = 'https://public:private@app.getsentry.com/269';

Raven.config(dsn).install(function(err, sendErr) {
  assert.ok(err instanceof Error);
  assert.ok(sendErr instanceof Error);
  assert.equal(err.message, 'derp');
  assert.equal(sendErr.message, 'foo');
  console.log('exit test assertions complete');
  process.exit(20);
});

Raven.transport.send = function() {
  throw new Error('foo');
};

process.emit('uncaughtException', new Error('derp'));
