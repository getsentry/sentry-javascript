// Functions to test stacktraces
function giveMeAnError() {
  outlandishClaim('I am Batman', 'Seriously');
}

function outlandishClaim(arg1, arg2) {
  varThatDoesNotExist++;
}

function generateError() {
  try { giveMeAnError(); } catch(e) { return e; }
}

describe('Raven', function() {
  var fakeServer, error;

  describe('.captureException', function() {
    beforeEach(function() {
      fakeServer = sinon.fakeServer.create();
      error = generateError();

      TraceKit.remoteFetching = false;
    });

    afterEach(function() {
      fakeServer.restore();
      TraceKit.remoteFetching = true;
    });

    it('should submit an XHR request', function(done) {
      try {
        Raven.captureException(error);
      } catch(e) {
        // should reraise
        expect(e).to.be.ok;
      }
      // captureException happens async, so we need to wait until next tick
      setTimeout(function() {
        expect(fakeServer.requests.length).to.equal(1);
        done();
      }, 0);
    });

    it('should produce a sane JSON payload', function(done) {
      try {
        Raven.captureException(error);
      } catch(e) {}

      setTimeout(function() {
        var req = fakeServer.requests[0];
        var body = JSON.parse(req.requestBody);

        expect(body.culprit).to.equal(window.location.href);
        expect(body.project).to.equal(1);
        expect(body.logger).to.equal('javascript');
        expect(body.message.indexOf('varThatDoesNotExist')).to.not.equal(-1);
        expect(body.timestamp).to.be.a('string');
        expect(body['sentry.interfaces.Exception'].value.indexOf('varThatDoesNotExist')).to.not.equal(-1);
        expect(body['sentry.interfaces.Http'].headers).to.be.an('object');
        expect(body['sentry.interfaces.Http'].querystring).to.be.equal(window.location.search.substr(1));

        // var url = window.location.origin + '/test/raven.test.js';
        var expectedFrames = [
          {filename: 'raven.test.js', 'function': 'outlandishClaim', lineno: 7},
          {filename: 'raven.test.js', 'function': 'giveMeAnError',   lineno: 3},
          {filename: 'raven.test.js', 'function': 'generateError',   lineno: 11}
        ];
        for (var i=0; i<expectedFrames.length; i++) {
          for (var key in expectedFrames[i]) {
            expect(body['sentry.interfaces.Stacktrace'].frames[i][key]).to.equal(expectedFrames[i][key]);
          }
        }

        done();
      }, 0);
    });
  });
});
