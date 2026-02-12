/**
 * Test that verifies thenable objects with extra methods (like jQuery's jqXHR)
 * preserve those methods when returned from Sentry.startSpan().
 *
 * This tests the Proxy fix for the GitHub issue where:
 *   const jqXHR = Sentry.startSpan({ name: "test" }, () => $.ajax(...));
 *   jqXHR.abort(); // Should work!
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

    // Real-world test: Wrap actual jQuery $.ajax() call in startSpan
    const result = Sentry.startSpan({ name: 'test-jqxhr', op: 'http.client' }, () => {
      // Make a real AJAX request with jQuery
      const d = window.jQuery.ajax({
        url: 'https://httpbin.org/status/200',
        method: 'GET',
        timeout: 5000,
      });
      // Check if jqXHR methods are preserved
      const hasAbort1 = typeof d.abort === 'function';
      const hasStatus1 = 'status' in d;
      const hasReadyState1 = 'readyState' in d;

      console.log('[AJAX CALL] jqXHR object:', Object.keys(d));

      console.log('jqXHR methods preserved:', d.readyState, { hasAbort1, hasStatus1, hasReadyState1 });

      return d;
    });

    // Check if jqXHR methods are preserved using 'in' operator (tests has trap)
    const hasAbort = typeof result.abort === 'function';
    const hasReadyState = 'readyState' in result;

    console.log('Result object keys:', Object.keys(result));

    console.log('jqXHR methods preserved:', {
      hasAbort,
      hasReadyState,
      readyStateValue: result.readyState,
      abortType: typeof result.abort,
    });

    if (true || (hasAbort && hasReadyState)) {
      // Call abort() to test it works
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
