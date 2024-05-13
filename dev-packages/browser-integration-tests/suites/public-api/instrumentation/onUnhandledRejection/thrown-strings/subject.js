function run() {
  const reason = 'stringError';
  const promise = Promise.reject(reason);
  const event = new PromiseRejectionEvent('unhandledrejection', { promise, reason });
  // simulate window.onunhandledrejection without generating a Script error
  window.onunhandledrejection(event);
}

run();
