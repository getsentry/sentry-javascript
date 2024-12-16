import { sentryCore } from '../build-test/index.js';

export interface TestTransportOptions extends sentryCore.BaseTransportOptions {
  callback: (envelope: sentryCore.Envelope) => void;
}

/**
 * Creates a Transport that uses the Fetch API to send events to Sentry.
 */
export function makeTestTransport(callback: (envelope: sentryCore.Envelope) => void) {
  return (options: sentryCore.BaseTransportOptions): sentryCore.Transport => {
    async function doCallback(request: sentryCore.TransportRequest): Promise<sentryCore.TransportMakeRequestResponse> {
      await callback(sentryCore.parseEnvelope(request.body));

      return Promise.resolve({
        statusCode: 200,
      });
    }

    return sentryCore.createTransport(options, doCallback);
  };
}
