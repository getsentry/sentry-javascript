// Keep the test child process's event loop alive long enough for the SDK to
// flush envelopes. The runner injects this script via `--require` so scenarios
// don't need to add `setInterval(() => {}, 1000)` themselves.
//
// Most scenarios end synchronously after queuing spans/events. The OTel batch
// processor and Sentry client flush asynchronously, so without a live handle
// Node exits before envelopes reach the (logging) transport.
//
// SIGTERM/SIGINT clears the interval so the runner's `child.kill()` shuts the
// child down cleanly — the handler suppresses the default action, but with
// nothing else pending the loop drains and the process exits. Tests that
// register their own SIGTERM handler (e.g. vercel/sigterm-flush) still work:
// both handlers fire, both intervals clear, and the SDK's `beforeExit` hook
// gets a chance to flush before exit.
const interval = setInterval(() => {}, 1000);

function stop() {
  clearInterval(interval);
}

process.once('SIGTERM', stop);
process.once('SIGINT', stop);
