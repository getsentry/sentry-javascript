'use strict';

var transports = require('../lib/transports');

describe('transports', function() {
  it('should emit error when requests queued over the limit', function(done) {
    var http = transports.http;
    var _cachedAgent = http.options.agent;

    http.options.agent = {
      requests: {
        'foo:1234': Array.from({length: 10}).fill('req')
      }
    };

    http.send({
      dsn: {
        host: 'foo',
        port: 1234
      },
      maxReqQueueCount: 5,
      emit: function(event, body) {
        event.should.equal('error');
        body.message.should.equal('client req queue is full..');
        http.options.agent = _cachedAgent;
        done();
      }
    });
  });
});
