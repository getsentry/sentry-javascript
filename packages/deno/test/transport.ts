import { createTransport } from 'npm:@sentry/core';
import type {
  BaseTransportOptions,
  Envelope,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
} from 'npm:@sentry/types';
import { parseEnvelope } from 'npm:@sentry/utils';

export interface TestTransportOptions extends BaseTransportOptions {
  callback: (envelope: Envelope) => void;
}

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeTestTransport(callback: (envelope: Envelope) => void) {
  return (options: BaseTransportOptions): Transport => {
    async function doCallback(request: TransportRequest): Promise<TransportMakeRequestResponse> {
      await callback(parseEnvelope(request.body, new TextEncoder(), new TextDecoder()));

      return Promise.resolve({
        statusCode: 200,
      });
    }

    return createTransport(options, doCallback);
  };
}
