import type { sentryTypes } from '../build-test/index.js';
import { sentryCore, sentryUtils } from '../build-test/index.js';

export interface TestTransportOptions extends sentryTypes.BaseTransportOptions {
  callback: (envelope: sentryTypes.Envelope) => void;
}

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeTestTransport(callback: (envelope: sentryTypes.Envelope) => void) {
  return (options: sentryTypes.BaseTransportOptions): sentryTypes.Transport => {
    async function doCallback(
      request: sentryTypes.TransportRequest,
    ): Promise<sentryTypes.TransportMakeRequestResponse> {
      await callback(sentryUtils.parseEnvelope(request.body, new TextEncoder(), new TextDecoder()));

      return Promise.resolve({
        statusCode: 200,
      });
    }

    return sentryCore.createTransport(options, doCallback);
  };
}
