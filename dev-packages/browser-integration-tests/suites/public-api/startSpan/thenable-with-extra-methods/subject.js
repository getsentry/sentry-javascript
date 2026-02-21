/**
 * Test that verifies thenable objects with extra methods (like jQuery's jqXHR)
 * preserve those methods when returned from Sentry.startSpan().
 *
 * Example case:
 *   const jqXHR = Sentry.startSpan({ name: "test" }, () => $.ajax(...));
 *   jqXHR.abort(); // Should work and not throw an error because of missing abort() method
 */

// Load jQuery from CDN
const script = document.createElement('script');
script.src = 'https://code.jquery.com/jquery-3.7.1.min.js';
script.integrity = 'sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=';
script.crossOrigin = 'anonymous';

script.onload = function () {
  runTest();
};

script.onerror = function () {
  window.jqXHRTestError = 'Failed to load jQuery';
  window.jqXHRMethodsPreserved = false;
};

document.head.appendChild(script);

async function runTest() {
  window.jqXHRAbortCalled = false;
  window.jqXHRAbortResult = null;
  window.jqXHRTestError = null;

  try {
    if (!window.jQuery) {
      throw new Error('jQuery not loaded');
    }

    const result = Sentry.startSpan({ name: 'test-jqxhr', op: 'http.client' }, () => {
      // Make a real AJAX request with jQuery
      return window.jQuery.ajax({
        url: 'https://httpbin.org/status/200',
        method: 'GET',
        timeout: 5000,
      });
    });

    const hasAbort = typeof result.abort === 'function';
    const hasReadyState = 'readyState' in result;

    if (hasAbort && hasReadyState) {
      try {
        result.abort();
        window.jqXHRAbortCalled = true;
        window.jqXHRAbortResult = 'abort-successful';
        window.jqXHRMethodsPreserved = true;
      } catch (e) {
        console.log('abort() threw an error:', e);
        window.jqXHRTestError = `abort() failed: ${e.message}`;
        window.jqXHRMethodsPreserved = false;
      }
    } else {
      window.jqXHRMethodsPreserved = false;
      window.jqXHRTestError = 'jqXHR methods not preserved';
    }

    // Since we aborted the request, it should be rejected
    try {
      await result;
      window.jqXHRPromiseResolved = true; // Unexpected
    } catch (err) {
      // Expected: aborted request rejects
      window.jqXHRPromiseResolved = false;
      window.jqXHRPromiseRejected = true;
    }
  } catch (error) {
    console.error('Test error:', error);
    window.jqXHRTestError = error.message;
    window.jqXHRMethodsPreserved = false;
  }
}
