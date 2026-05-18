// Keep the test child process's event loop alive long enough for the SDK to
// flush envelopes. The runner injects this script via `--require` so scenarios
// don't need to add `setInterval(() => {}, 1000)` themselves.
//
// Most scenarios end synchronously after queuing spans/events. The OTel batch
// processor and Sentry client flush asynchronously, so without a live handle
// Node exits before envelopes reach the (logging) transport.
//
// SIGTERM/SIGINT clears the interval and schedules an unref'd force-exit
// timer. The force-exit covers scenarios with other lingering handles
// (Express servers binding fixed ports, persistent DB connections, ...) that
// before this script were swept away by SIGTERM's default action — without it
// those handles would prevent the child from exiting and the next test run
// would hit EADDRINUSE. The timer is `.unref()`d so a clean drain still exits
// naturally before it fires (important for `vercel/sigterm-flush` and any
// other test that relies on `beforeExit` flushing).
const interval = setInterval(() => {}, 1000);

function stop() {
  clearInterval(interval);
  setTimeout(() => process.exit(0), 2000).unref();
}

process.once('SIGTERM', stop);
process.once('SIGINT', stop);
