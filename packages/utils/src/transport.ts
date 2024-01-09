import type { BaseTransportOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/types';

/**
 * Debug logging transport
 */
export function loggingTransport(_options: BaseTransportOptions): Transport {
  return {
    send(request: Envelope): Promise<void | TransportMakeRequestResponse> {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(request));
      return Promise.resolve({ statusCode: 200 });
    },
    flush(): PromiseLike<boolean> {
      return Promise.resolve(true);
    },
  };
}
