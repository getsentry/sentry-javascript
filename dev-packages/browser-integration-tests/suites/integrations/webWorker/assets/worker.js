self._sentryDebugIds = {
  'Error at http://sentry-test.io/worker.js': 'worker-debug-id-789',
};

self.postMessage({
  _sentryMessage: true,
  _sentryDebugIds: self._sentryDebugIds,
});

self.addEventListener('message', event => {
  if (event.data.type === 'throw-error') {
    throw new Error('Worker error for testing');
  }
});
