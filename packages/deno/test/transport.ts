import type {
  BaseTransportOptions,
  Envelope,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
} from '@sentry/core';
import { createTransport, parseEnvelope } from '@sentry/core';

export interface TestTransportOptions extends BaseTransportOptions {
  callback: (envelope: Envelope) => void;
}

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeTestTransport(callback: (envelope: Envelope) => void) {
  return (options: BaseTransportOptions): Transport => {
    async function doCallback(request: TransportRequest): Promise<TransportMakeRequestResponse> {
      await callback(parseEnvelope(request.body));

      return Promise.resolve({
        statusCode: 200,
      });
    }

    return createTransport(options, doCallback);
  };
}
