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
