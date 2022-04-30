import { Envelope, BaseEnvelopeHeaders, BaseEnvelopeItemHeaders } from '@sentry/types';

export const testOnlyIfNodeVersionAtLeast = (minVersion: number): jest.It => {
  const currentNodeVersion = process.env.NODE_VERSION;

  try {
    if (Number(currentNodeVersion?.split('.')[0]) < minVersion) {
      return it.skip;
    }
  } catch (oO) {
    // we can't tell, so err on the side of running the test
  }

  return it;
};

/**
 * A naive binary envelope parser
 */
export function parseEnvelope(env: string | Uint8Array): Envelope {
  if (typeof env === 'string') {
    env = new TextEncoder().encode(env);
  }

  let envelopeHeaders: BaseEnvelopeHeaders | undefined;
  let lastItemHeader: BaseEnvelopeItemHeaders | undefined;
  const items: [any, any][] = [];

  let binaryLength = 0;
  while (env.length) {
    // Next length is either the binary length from the previous header
    // or the next newline character
    let i = binaryLength || env.indexOf(0xa);

    // If no newline was found, assume this is the last block
    if (i < 0) {
      i = env.length;
    }

    // If we read out a length in the previous header, assume binary
    if (binaryLength > 0) {
      const bin = env.slice(0, binaryLength);
      binaryLength = 0;
      items.push([lastItemHeader, bin]);
    } else {
      const json = JSON.parse(new TextDecoder().decode(env.slice(0, i + 1)));

      if (typeof json.length === 'number') {
        binaryLength = json.length;
      }

      // First json is always the envelope headers
      if (!envelopeHeaders) {
        envelopeHeaders = json;
      } else {
        // If there is a type property, assume this is an item header
        if ('type' in json) {
          lastItemHeader = json;
        } else {
          items.push([lastItemHeader, json]);
        }
      }
    }

    // Replace the buffer with the previous block and newline removed
    env = env.slice(i + 1);
  }

  return [envelopeHeaders as BaseEnvelopeHeaders, items];
}
