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

TraceKit.remoteFetching = false;

describe('Raven', function() {
  var error = generateError();

  describe('.captureException', function() {
    beforeEach(function() {
      Raven.config('http://e89652ec30b94d9db6ea6f28580ab499@localhost/69');
    });

    afterEach(function() {
      //
    });

    /*
    it('should produce a sane JSON payload', function(done) {
      Raven.captureException(error);

      setTimeout(function() {
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
    */
  });
});
