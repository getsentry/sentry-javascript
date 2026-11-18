import type { BaseTransportOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import type { Express } from 'express';
import type { ServerResponse } from 'http';
import type { AddressInfo } from 'net';

export * from './mocks/anthropic';
export * from './mocks/google';
export * from './mocks/openai';

/**
 * Debug logging transport
 */
export function loggingTransport(_options: BaseTransportOptions): Transport {
  return {
    send(request: Envelope): Promise<TransportMakeRequestResponse> {
      // Not `console.log`: Bun 1.3 drops its newline for a string of exactly 4096 bytes, merging two
      // envelopes into one line the runner can't parse.
      process.stdout.write(`${JSON.stringify(request)}\n`);
      return Promise.resolve({ statusCode: 200 });
    },
    flush(): PromiseLike<boolean> {
      return new Promise(resolve => setTimeout(() => resolve(true), 1000));
    },
  };
}

/**
 * Starts an express server and sends the port to the runner
 * @param app Express app
 * @param port Port to start the app on. USE WITH CAUTION! By default a random port will be chosen.
 * Setting this port to something specific is useful for local debugging but dangerous for
 * CI/CD environments where port collisions can cause flakes!
 */
export function startExpressServerAndSendPortToRunner(
  app: Pick<Express, 'listen'>,
  port: number | undefined = undefined,
): void {
  const server = app.listen(port || 0, () => {
    const address = server.address() as AddressInfo;

    // @ts-expect-error If we write the port to the app we can read it within route handlers in tests
    app.port = port || address.port;

    // eslint-disable-next-line no-console
    console.log(`{"port":${port || address.port}}`);
  });
}

export interface MockServer {
  /** `http://localhost:<port>`, without a trailing slash. */
  url: string;
  close: () => void;
}

/**
 * Starts `app` on a random port, for scenarios that point a client at a mock API.
 *
 * Takes the app rather than creating it, so this module never loads `express` itself: instrument
 * files import it before `Sentry.init()`, and loading express there would keep it from being
 * instrumented.
 */
export function startMockServer(app: Pick<Express, 'listen'>): Promise<MockServer> {
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve({
        url: `http://localhost:${(server.address() as AddressInfo).port}`,
        close: () => server.close(),
      });
    });
  });
}

/**
 * Streams `events` as server-sent events, 10ms apart, then ends the response.
 *
 * `eventNames` adds an `event: <event.type>` line to each event (Anthropic style). `done` sends a
 * final `data: [DONE]` (OpenAI style).
 */
export function streamSseEvents(
  res: Pick<ServerResponse, 'writeHead' | 'write' | 'end'>,
  events: unknown[],
  { eventNames = false, done = false }: { eventNames?: boolean; done?: boolean } = {},
): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  events.forEach((event, index) => {
    setTimeout(() => {
      const name = eventNames ? `event: ${(event as { type: string }).type}\n` : '';
      res.write(`${name}data: ${JSON.stringify(event)}\n\n`);
      if (index === events.length - 1) {
        if (done) {
          res.write('data: [DONE]\n\n');
        }
        res.end();
      }
    }, index * 10);
  });
}

/**
 * Sends the port to the runner
 */
export function sendPortToRunner(port: number): void {
  // eslint-disable-next-line no-console
  console.log(`{"port":${port}}`);
}

/**
 * Can be used to get the port of a running app, so requests can be sent to a server from within the server.
 */
export function getPortAppIsRunningOn(app: Express): number | undefined {
  // @ts-expect-error It's not defined in the types but we'd like to read it.
  return app.port;
}

/**
 * Retries `probe` until it resolves, or throws once `timeout` ms elapse.
 *
 * DB scenarios that start a Docker container with `docker compose up --wait` still flake on CI: `--wait`
 * only gates on the container's internal healthcheck, but databases keep finalizing for a short window
 * afterwards. The host port-forward can lag (`ECONNREFUSED`/`ECONNRESET`), MySQL drops early handshakes
 * ("server closed the connection"), and MSSQL is slow to start accepting connections. A scenario whose
 * first connection lands in that window fails before it does any work, so no transaction is sent.
 *
 * Await this before the scenario opens its span, passing a probe that opens (and closes) a throwaway
 * connection with the suite's own driver. A pure TCP check is not enough — the port accepts the socket
 * while the handshake is still refused — so the probe must perform a real driver connection. Because it
 * runs with no active span, the connect is not instrumented and emits no spans.
 */
export async function waitForConnection<T extends () => Promise<unknown>>(
  probe: T,
  { timeout = 60_000, interval = 500 }: { timeout?: number; interval?: number } = {},
): Promise<ReturnType<T>> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  for (;;) {
    try {
      // probe() is already awaited here; the cast widens to ReturnType<T> (a Promise type), which
      // makes return-await think an outer await is still needed, so suppress it.
      // oxlint-disable-next-line typescript/return-await
      return (await probe()) as ReturnType<T>;
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for a database connection after ${timeout}ms: ${String(lastError)}`);
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}
