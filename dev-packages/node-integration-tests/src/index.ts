import type { BaseTransportOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import type { Express } from 'express';
import type { AddressInfo } from 'net';

/**
 * Debug logging transport
 */
export function loggingTransport(_options: BaseTransportOptions): Transport {
  return {
    send(request: Envelope): Promise<TransportMakeRequestResponse> {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(request));
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
 * Whether channel-based (orchestrion diagnostics-channel) instrumentation is active.
 *
 * Channel-based instrumentation is the default in v11, so this is always `true`. Kept as a helper
 * (rather than inlining `true`) so the suites' origin/shape selectors read intentionally; the OTel
 * branches they still contain are dead and get removed alongside the vendored OTel code (JS-3074).
 */
export function isOrchestrionEnabled(): boolean {
  return true;
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
