import type {
  BaseTransportOptions,
  Envelope,
  EnvelopeItemType,
  Event,
  EventItem,
  Transport,
  TransportMakeRequestResponse,
} from '@sentry/types';
import { dsnFromString, forEachEnvelopeItem } from '@sentry/utils';

import { getEnvelopeEndpointWithUrlEncodedAuth } from '../api';

interface MatchParam {
  /** The envelope to be sent */
  envelope: Envelope;
  /**
   * A function that returns an event from the envelope if one exists. You can optionally pass an array of envelope item
   * types to filter by - only envelopes matching the given types will be multiplexed.
   * Allowed values are: 'event', 'transaction', 'profile', 'replay_event'
   *
   * @param types Defaults to ['event']
   */
  getEvent(types?: EnvelopeItemType[]): Event | undefined;
}

type RouteTo = { dsn: string; release: string };
type Matcher = (param: MatchParam) => (string | RouteTo)[];

/**
 * Gets an event from an envelope.
 *
 * This is only exported for use in the tests
 */
export function eventFromEnvelope(env: Envelope, types: EnvelopeItemType[]): Event | undefined {
  let event: Event | undefined;

  forEachEnvelopeItem(env, (item, type) => {
    if (types.includes(type)) {
      event = Array.isArray(item) ? (item as EventItem)[1] : undefined;
    }
    // bail out if we found an event
    return !!event;
  });

  return event;
}

/**
 * Creates a transport that overrides the release on all events.
 */
function makeOverrideReleaseTransport<TO extends BaseTransportOptions>(
  createTransport: (options: TO) => Transport,
  release: string,
): (options: TO) => Transport {
  return options => {
    const transport = createTransport(options);

    return {
      send: async (envelope: Envelope): Promise<TransportMakeRequestResponse> => {
        const event = eventFromEnvelope(envelope, ['event', 'transaction', 'profile', 'replay_event']);

        if (event) {
          event.release = release;
        }
        return transport.send(envelope);
      },
      flush: timeout => transport.flush(timeout),
    };
  };
}

/**
 * Creates a transport that can send events to different DSNs depending on the envelope contents.
 */
export function makeMultiplexedTransport<TO extends BaseTransportOptions>(
  createTransport: (options: TO) => Transport,
  matcher: Matcher,
): (options: TO) => Transport {
  return options => {
    const fallbackTransport = createTransport(options);
    const otherTransports: Record<string, Transport> = {};

    function getTransport(dsn: string, release: string | undefined): Transport | undefined {
      // We create a transport for every unique dsn/release combination as there may be code from multiple releases in
      // use at the same time
      const key = release ? `${dsn}:${release}` : dsn;

      if (!otherTransports[key]) {
        const validatedDsn = dsnFromString(dsn);
        if (!validatedDsn) {
          return undefined;
        }
        const url = getEnvelopeEndpointWithUrlEncodedAuth(validatedDsn);

        otherTransports[key] = release
          ? makeOverrideReleaseTransport(createTransport, release)({ ...options, url })
          : createTransport({ ...options, url });
      }

      return otherTransports[key];
    }

    async function send(envelope: Envelope): Promise<TransportMakeRequestResponse> {
      function getEvent(types?: EnvelopeItemType[]): Event | undefined {
        const eventTypes: EnvelopeItemType[] = types && types.length ? types : ['event'];
        return eventFromEnvelope(envelope, eventTypes);
      }

      const transports = matcher({ envelope, getEvent })
        .map(result => {
          if (typeof result === 'string') {
            return getTransport(result, undefined);
          } else {
            return getTransport(result.dsn, result.release);
          }
        })
        .filter((t): t is Transport => !!t);

      // If we have no transports to send to, use the fallback transport
      if (transports.length === 0) {
        transports.push(fallbackTransport);
      }

      const results = await Promise.all(transports.map(transport => transport.send(envelope)));

      return results[0];
    }

    async function flush(timeout: number | undefined): Promise<boolean> {
      const allTransports = [...Object.keys(otherTransports).map(dsn => otherTransports[dsn]), fallbackTransport];
      const results = await Promise.all(allTransports.map(transport => transport.flush(timeout)));
      return results.every(r => r);
    }

    return {
      send,
      flush,
    };
  };
}

export const SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY = 'SIMPLE_MULTIPLEXED_TRANSPORT_ROUTE_TO';

/**
 * Creates a transport that will send events to all DSNs provided in `event.extra[SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY]`,
 * which should contain values in the format of `Array<{ dsn: string;, release: string; }>`.
 *
 * If the value is `undefined` or `[]`, the event will be sent to the `dsn` value provided in your Sentry SDK initialization options as a fallback mechanism.
 */
export function makeSimpleMultiplexedTransport<TO extends BaseTransportOptions>(
  transportGenerator: (options: TO) => Transport,
): (options: TO) => Transport {
  return makeMultiplexedTransport(transportGenerator, args => {
    const event = args.getEvent();
    if (
      event &&
      event.extra &&
      SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY in event.extra &&
      Array.isArray(event.extra[SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY])
    ) {
      return event.extra[SIMPLE_MULTIPLEXED_TRANSPORT_EXTRA_ROUTING_KEY];
    }
    return [];
  });
}
