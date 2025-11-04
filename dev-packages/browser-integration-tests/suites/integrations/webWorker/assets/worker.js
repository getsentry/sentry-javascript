// This worker manually replicates what Sentry.registerWebWorker() does
// (In real code with a bundler, you'd import and call Sentry.registerWebWorker({ self }))

self._sentryDebugIds = {
  'Error at http://sentry-test.io/worker.js': 'worker-debug-id-789',
};

// Send debug IDs
self.postMessage({
  _sentryMessage: true,
  _sentryDebugIds: self._sentryDebugIds,
});

// Set up unhandledrejection handler (same as registerWebWorker)
self.addEventListener('unhandledrejection', event => {
  self.postMessage({
    _sentryMessage: true,
    _sentryWorkerError: {
      reason: event.reason,
      filename: self.location.href,
    },
  });
});

self.addEventListener('message', event => {
  if (event.data.type === 'throw-error') {
    throw new Error('Worker error for testing');
  }

  if (event.data.type === 'throw-rejection') {
    // Create an unhandled rejection
    Promise.reject(new Error('Worker unhandled rejection'));
  }
});
