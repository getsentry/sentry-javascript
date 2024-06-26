/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { AddressInfo } from 'net';
import type { BaseTransportOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/types';

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
 */
export function startExpressServerAndSendPortToRunner(app: any): void {
  const server = app.listen(0, () => {
    const address = server.address() as AddressInfo;

    // eslint-disable-next-line no-console
    console.log(`{"port":${address.port}}`);
  });
}

/**
 * Sends the port to the runner
 */
export function sendPortToRunner(port: number): void {
  // eslint-disable-next-line no-console
  console.log(`{"port":${port}}`);
}
