function run() {
  const reason = {
    a: '1'.repeat('100'),
    b: '2'.repeat('100'),
    c: '3'.repeat('100'),
  };
  reason.d = reason.a;
  reason.e = reason;
  const promise = Promise.reject(reason);
  const event = new PromiseRejectionEvent('unhandledrejection', { promise, reason });
  // simulate window.onunhandledrejection without generating a Script error
  window.onunhandledrejection(event);
}

run();
