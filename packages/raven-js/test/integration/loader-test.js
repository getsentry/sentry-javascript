/*global assert*/
function iframeExecute(iframe, done, execute, assertCallback) {
  iframe.contentWindow.done = function() {
    try {
      assertCallback(iframe);
      done();
    } catch (e) {
      done(e);
    }
  };
  // use setTimeout so stack trace doesn't go all the way back to mocha test runner
  iframe.contentWindow.eval(
    'window.originalBuiltIns.setTimeout.call(window, ' + execute.toString() + ');'
  );
}

function createIframe(done) {
  var iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = './base/test/integration/loader.html';
  iframe.onload = function() {
    done();
  };
  document.body.appendChild(iframe);
  return iframe;
}

describe('Async SDK Loader', function() {
  this.timeout(30000);

  beforeEach(function(done) {
    this.iframe = createIframe(done);
  });

  afterEach(function() {
    document.body.removeChild(this.iframe);
  });

  it('should capture errors before and after SDK is loaded', function(done) {
    var iframe = this.iframe;

    iframeExecute(
      iframe,
      done,
      function() {
        // This is to ensure that we are indeed queuing the errors
        if (typeof window.Raven !== 'undefined') {
          window.loadedPreTest = true;
        } else {
          window.loadedPreTest = false;
        }

        // Because we pre-load loader.js through karma, we don't have to worry about XHR delays etc.
        setTimeout(function() {
          Raven.captureException(new Error('post load exception'));
          done();
        }, 1000);
      },
      function() {
        // Raven shouldn't be loaded synchronously, so it shouldnt be available at the beginning
        assert.equal(iframe.contentWindow.loadedPreTest, false, 'A');
        // but it should be available later on
        assert.equal(typeof iframe.contentWindow.Raven !== 'undefined', true, 'B');
        // and it should be configured
        assert.equal(iframe.contentWindow.Raven.isSetup(), true, 'C');

        var ravenData = iframe.contentWindow.ravenData;

        if (iframe.contentWindow.supportsOnunhandledrejection) {
          assert.equal(ravenData.length, 3);
          assert.equal(ravenData[0].exception.values[0].value, 'pre load exception');
          assert.equal(ravenData[1].exception.values[0].value, 'pre load rejection');
          assert.equal(ravenData[2].exception.values[0].value, 'post load exception');
        } else {
          assert.equal(ravenData.length, 2);
          assert.equal(ravenData[0].exception.values[0].value, 'pre load exception');
          assert.equal(ravenData[1].exception.values[0].value, 'post load exception');
        }
      }
    );
  });
});
