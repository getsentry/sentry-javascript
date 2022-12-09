# Profiling support for worker threads

Profiling is supported in worker threads for node versions, however each thread is treated as a separate entity and cross thread profiler are currently not linked together in any way. If this is something that you would like us to support, please file a feature request describing your use-case.

## Worker SDK setup

Profiling worker threads requires the Sentry SDK to be initialized per thread. If you are cloning the Sentry hub and passing it to workers, you will have to change your approach and reinitialize the SDK in each thread.

```ts
// cpuintense.worker.js
const Sentry = require('@sentry/node');
const { parentPort } = require('node:worker_threads');
require('@sentry/tracing'); // this has a addExtensionMethods side effect
const { ProfilingIntegration } = require('@sentry/profiler-node'); // this has a addExtensionMethods side effect

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  debug: true,
  tracesSampleRate: 1,
  profilesSampleRate: 1,
  integrations: [new ProfilingIntegration()]
});

/*
 * Synchronous worker example
 */
const transaction = Sentry.startTransaction({ name: 'worker_profiling' });
// The code between these two calls will be profiled.
transaction.finish();

/*
 * Asynchronous worker example
 */
parentPort.on('message', () => {
  const transaction = Sentry.startTransaction({ name: 'worker_profiling' });
  // The code between these two calls will be profiled each time a message is received
  transaction.finish();
});
```

## Questions, issues or feature requests?

Please file an issue.
