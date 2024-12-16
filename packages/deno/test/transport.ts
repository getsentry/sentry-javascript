import type {
  BaseTransportOptions,
  Envelope,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
} from '@sentry/core';
import { sentryCore } from '../build-test/index.js';

export interface TestTransportOptions extends BaseTransportOptions {
  callback: (envelope: Envelope) => void;
}

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeTestTransport(callback: (envelope: Envelope) => void) {
  return (options: BaseTransportOptions): Transport => {
    async function doCallback(request: TransportRequest): Promise<TransportMakeRequestResponse> {
      await callback(sentryCore.parseEnvelope(request.body));

      return Promise.resolve({
        statusCode: 200,
      });
    }

    return sentryCore.createTransport(options, doCallback);
  };
}
