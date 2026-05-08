/**
 * Standalone profiling script for the span pipeline.
 *
 * Imports from the built ESM output so `node --cpu-prof` profiles
 * the actual production code, not vitest/tsx overhead.
 *
 * Usage:
 *   cd packages/core
 *   node --cpu-prof test/bench/profile-spans.mjs [spanCount] [iterations]
 *
 * Then open the generated .cpuprofile in Chrome DevTools (Performance tab)
 * or VS Code to see the flame chart.
 */

import {
  addBreadcrumb,
  Client,
  createTransport,
  getCurrentScope,
  getIsolationScope,
  resolvedSyncPromise,
  setCurrentClient,
  startSpan,
} from '../../build/esm/index.js';

const SPAN_COUNT = parseInt(process.argv[2] || '1000', 10);
const ITERATIONS = parseInt(process.argv[3] || '100', 10);

// --- Inline TestClient (avoids TS import) ---

class ProfileClient extends Client {
  eventFromException(exception) {
    return resolvedSyncPromise({
      exception: {
        values: [{ type: exception.name, value: exception.message }],
      },
    });
  }

  eventFromMessage(message, level = 'info') {
    return resolvedSyncPromise({ message, level });
  }
}

// --- Setup ---

function setup() {
  getCurrentScope().clear();
  getIsolationScope().clear();

  const client = new ProfileClient({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    release: '1.0.0',
    environment: 'production',
    integrations: [],
    stackParser: () => [],
    transport: () =>
      createTransport(
        { recordDroppedEvent: () => undefined },
        () => resolvedSyncPromise({}),
      ),
  });

  setCurrentClient(client);
  client.init();

  getCurrentScope().setUser({ id: '123', email: 'user@example.com' });
  getCurrentScope().setTag('service', 'api-gateway');
  getCurrentScope().setTag('region', 'us-east-1');
  getCurrentScope().setTag('version', '2.1.0');
  getCurrentScope().setExtra('request_id', 'req-abc-123');
  for (let i = 0; i < 10; i++) {
    addBreadcrumb({ message: `Action ${i}`, category: 'http', level: 'info' });
  }
}

// --- Run ---

setup();

console.log(`Profiling: ${SPAN_COUNT} child spans x ${ITERATIONS} iterations`);
console.log('');

const start = performance.now();

for (let iter = 0; iter < ITERATIONS; iter++) {
  startSpan({ name: 'GET /api/users', op: 'http.server' }, () => {
    for (let i = 0; i < SPAN_COUNT; i++) {
      startSpan({ name: `operation.${i}`, op: 'db' }, span => {
        span.setAttribute('db.system', 'postgresql');
      });
    }
  });
}

const elapsed = performance.now() - start;
const perIteration = elapsed / ITERATIONS;

console.log(`Total: ${elapsed.toFixed(1)}ms`);
console.log(`Per transaction (${SPAN_COUNT} spans): ${perIteration.toFixed(2)}ms`);
console.log(`Per span: ${(perIteration / SPAN_COUNT * 1000).toFixed(1)}μs`);
console.log('');
console.log('CPU profile written to the current directory (*.cpuprofile).');
console.log('Open it in Chrome DevTools (Performance tab) or VS Code.');
