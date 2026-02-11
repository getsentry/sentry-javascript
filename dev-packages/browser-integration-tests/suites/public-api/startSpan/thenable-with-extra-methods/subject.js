/**
 * Test that verifies thenable objects with extra methods (like jQuery's jqXHR)
 * preserve those methods when returned from Sentry.startSpan().
 *
 * This tests the Proxy fix for the GitHub issue where:
 *   const jqXHR = Sentry.startSpan({ name: "test" }, () => $.ajax(...));
 *   jqXHR.abort(); // Should work!
 */

// Mock a jqXHR-like object (simulates jQuery.ajax() return value)
function createMockJqXHR() {
  let resolvePromise;
  const promise = new Promise(resolve => {
    resolvePromise = resolve;
  });

  console.log('');

  // Create an object that has both Promise methods and XHR methods
  const mockJqXHR = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    abort: function () {
      window.jqXHRAbortCalled = true;
      window.jqXHRAbortResult = 'abort-successful';
      return 'abort-successful';
    },
    // XHR-like properties
    status: 0,
    readyState: 1,
    responseText: '',
  };

  // Resolve after a short delay
  //setTimeout(() => resolvePromise({ data: 'test response' }), 50);

  return mockJqXHR;
}

async function runTest() {
  window.jqXHRAbortCalled = false;
  window.jqXHRAbortResult = null;
  window.jqXHRTestError = null;

  try {
    // This simulates: const jqXHR = Sentry.startSpan(() => $.ajax(...));
    const result = Sentry.startSpan({ name: 'test-jqxhr', op: 'http.client' }, () => {
      const dd = createMockJqXHR();
      const hasAbort = typeof dd.abort === 'function';
      const hasStatus = 'status' in dd;
      const hasReadyState = 'readyState' in dd;

      console.log('ddhasAbort:', hasAbort, 'hasStatus:', hasStatus, 'hasReadyState:', hasReadyState);
      return dd;
    });

    console.log('result from startSpan:', result);

    // Check if extra methods are preserved via Proxy
    const hasAbort = typeof result.abort === 'function';
    const hasStatus = 'status' in result;
    const hasReadyState = 'readyState' in result;

    console.log('hasAbort:', hasAbort, 'hasStatus:', hasStatus, 'hasReadyState:', hasReadyState);

    if (hasAbort && hasStatus && hasReadyState) {
      // Call abort() to test it works
      const abortResult = result.abort();
      window.jqXHRMethodsPreserved = true;
      window.jqXHRAbortReturnValue = abortResult;
    } else {
      window.jqXHRMethodsPreserved = false;
    }

    // Verify promise functionality still works
    try {
      await result;
      window.jqXHRPromiseResolved = true;
    } catch (err) {
      window.jqXHRPromiseResolved = false;
    }
  } catch (error) {
    window.jqXHRTestError = error.message;
    window.jqXHRMethodsPreserved = false;
  }
}

runTest();
