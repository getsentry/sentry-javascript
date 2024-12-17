import type { AddressInfo } from 'net';
import type { BaseTransportOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import type { Express } from 'express';

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
export function startExpressServerAndSendPortToRunner(app: Express, port: number | undefined = undefined): void {
  const server = app.listen(port || 0, () => {
    const address = server.address() as AddressInfo;

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
