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
  var fakeServer;

  describe('.captureException', function() {
    beforeEach(function() {
      fakeServer = sinon.fakeServer.create();
      Raven.install();
      TraceKit.remoteFetching = false;
    });

    afterEach(function() {
      fakeServer.restore();
      TraceKit.remoteFetching = true;
    });

    it('should submit an XHR request', function(done) {
      var error = generateError();
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
  });
});