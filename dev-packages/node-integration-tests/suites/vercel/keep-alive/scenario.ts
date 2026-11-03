// Models a Vercel Node.js function: the platform exposes a per-request context with `waitUntil`,
// stops accepting `waitUntil` work once the response has closed, and freezes the instance right after the
// registered work settles. Nothing else (unref'd timers, SIGTERM) runs after the freeze.
import { AsyncLocalStorage } from 'node:async_hooks';
import * as http from 'node:http';
import * as net from 'node:net';
import type { BaseTransportOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import * as Sentry from '@sentry/node';

interface RequestStore {
  waitUntil: (task: Promise<unknown>) => void;
  closed: boolean;
}

const als = new AsyncLocalStorage<RequestStore>();
const registered: Promise<unknown>[] = [];
let late = 0;

(globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] = {
  get: () => als.getStore(),
};

function loggingTransport(_options: BaseTransportOptions): Transport {
  return {
    send(envelope: Envelope): Promise<TransportMakeRequestResponse> {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(envelope));
      return Promise.resolve({ statusCode: 200 });
    },
    flush(): PromiseLike<boolean> {
      return Promise.resolve(true);
    },
  };
}

// Cases: `default`, `no-tracing` (no `tracesSampleRate`), `head` (HEAD requests never get a server span),
// `slow` (the handler responds late) and `late-root` (the root span ends after the response closes).
const testCase = process.env.TEST_CASE || 'default';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: testCase === 'no-tracing' ? undefined : 1,
  enableLogs: true,
  traceLifecycle: process.env.TRACE_LIFECYCLE === 'stream' ? 'stream' : 'static',
  transport: loggingTransport,
  integrations: testCase === 'late-root' ? [Sentry.httpIntegration({ spans: false })] : [],
});

const server = http.createServer(async (_req, res) => {
  if (testCase === 'slow') {
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const respond = (): void => {
    Sentry.logger.info('keep alive log');
    Sentry.metrics.count('keep_alive_metric', 1);
    if (testCase === 'no-tracing') {
      Sentry.captureException(new Error('keep alive error'));
    }
    // Without a server span (HEAD), a manual span would become a root span itself and mask the case.
    if (testCase !== 'head') {
      Sentry.startSpan({ name: 'keep-alive-child' }, () => undefined);
    }
    res.writeHead(200);
    res.end('ok');
  };

  if (testCase === 'late-root') {
    // Some frameworks end the root span a moment after the response has closed.
    Sentry.startSpanManual({ name: 'GET /', op: 'http.server' }, span => {
      res.once('close', () => setTimeout(() => span.end(), 20));
      respond();
    });
  } else {
    respond();
  }
});

// As on Vercel, `http.server.request.start` fires before the request context exists. The context is active
// for the handler and the response it writes.
const originalEmit = server.emit;
server.emit = function (this: http.Server, event: string, ...args: unknown[]): boolean {
  if (event !== 'request') {
    return originalEmit.call(this, event, ...args);
  }

  const store: RequestStore = {
    closed: false,
    waitUntil: task => {
      if (store.closed) {
        late++;
      } else {
        registered.push(task);
      }
    },
  };
  // Registered before the original emit, so it runs before Sentry's own 'close' listeners.
  (args[1] as http.ServerResponse).once('close', () => {
    store.closed = true;
  });
  return als.run(store, () => originalEmit.call(this, event, ...args));
} as typeof server.emit;

server.listen(0, async () => {
  const { port } = server.address() as net.AddressInfo;

  // A raw socket keeps the request free of trace propagation headers, which would otherwise carry a
  // sampling decision into the server span.
  await new Promise<void>(resolve => {
    const socket = net.connect(port, 'localhost', () => {
      socket.write(
        `${testCase === 'head' ? 'HEAD' : 'GET'} / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`,
      );
    });
    socket.resume();
    socket.on('close', () => resolve());
  });

  // The freeze: only what was registered in time keeps the instance alive.
  await Promise.all(registered);
  // eslint-disable-next-line no-console
  console.log(`WAITUNTIL registered=${registered.length} late=${late}`);
  process.exit(0);
});
