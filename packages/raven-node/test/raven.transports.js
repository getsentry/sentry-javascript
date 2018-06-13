'use strict';

var transports = require('../lib/transports');

describe('transports', function() {
  it('should have an http/s agent with correct config attached by default', function() {
    var http = transports.http;
    http.agent.should.exist;
    http.agent.keepAlive.should.equal(true);
    http.agent.maxSockets.should.equal(100);

    var https = transports.https;
    https.agent.should.exist;
    https.agent.keepAlive.should.equal(true);
    https.agent.maxSockets.should.equal(100);
  });

  it('should emit error when requests queued over the limit', function(done) {
    var http = transports.http;
    var _cachedAgent = http.options.agent;

    var requests = {};
    for (var i = 0; i < 10; i++) {
      requests[i] = 'req';
    }

    http.agent = Object.assign({}, _cachedAgent, {
      getName: function() {
        return 'foo:123';
      },
      requests: {
        'foo:123': requests
      }
    });

    http.send({
      dsn: {
        host: 'foo',
        port: 123
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
