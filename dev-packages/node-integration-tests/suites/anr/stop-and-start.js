const Sentry = require('@sentry/node');

setTimeout(() => {
  process.exit();
}, 10000);

const anr = Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 });

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  debug: true,
  integrations: [anr],
});

Sentry.setUser({ email: 'person@home.com' });
Sentry.addBreadcrumb({ message: 'important message!' });

function longWorkIgnored() {
  // Busy-block the event loop with pure-JS work. The ANR worker samples the main thread via the
  // inspector, which can only pause at a JS safepoint; inside a native call like `crypto.pbkdf2Sync`
  // the pause resolves only after the call returns, so the sample can miss `longWork` and land in
  // timer internals instead. Pure-JS work keeps `longWork` on the sampled stack for the whole block.
  const start = Date.now();
  let n = 1;
  while (Date.now() - start < 1000) {
    n = (n * 1103515245 + 12345) % 2147483648;
  }
  return n;
}

function longWork() {
  // Busy-block the event loop with pure-JS work. The ANR worker samples the main thread via the
  // inspector, which can only pause at a JS safepoint; inside a native call like `crypto.pbkdf2Sync`
  // the pause resolves only after the call returns, so the sample can miss `longWork` and land in
  // timer internals instead. Pure-JS work keeps `longWork` on the sampled stack for the whole block.
  const start = Date.now();
  let n = 1;
  while (Date.now() - start < 1000) {
    n = (n * 1103515245 + 12345) % 2147483648;
  }
  return n;
}

setTimeout(() => {
  anr.stopWorker();

  setTimeout(() => {
    longWorkIgnored();

    setTimeout(() => {
      anr.startWorker();

      // Wait for the restarted worker to reconnect its debugger session before blocking the event
      // loop. The main-thread inspector stays open across restarts, so there is no main-thread signal
      // that the new worker is ready; without this, on slow CI `longWork` can run before the worker
      // is sampling and the ANR is missed entirely.
      anr.waitUntilWorkerReady().then(() => {
        longWork();
      });
    }, 2000);
  }, 2000);
}, 2000);
