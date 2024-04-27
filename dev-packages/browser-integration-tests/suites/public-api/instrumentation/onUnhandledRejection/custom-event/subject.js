function run() {
  // this isn't how it happens in real life, in that the promise and reason
  // values come from an actual PromiseRejectionEvent, but it's enough to test
  // how the SDK handles the structure
  window.dispatchEvent(
    new CustomEvent('unhandledrejection', {
      detail: {
        promise: new Promise(function () {}),
        // we're testing with an error here but it could be anything - really
        // all we're testing is that it gets dug out correctly
        reason: new Error('promiseError'),
      },
    }),
  );
}

run();
