function run() {
  const reason = null;
  const promise = Promise.reject(reason);
  const event = new PromiseRejectionEvent('unhandledrejection', { promise, reason });
  // simulate window.onunhandledrejection without generating a Script error
  window.onunhandledrejection(event);
}

run();
