import { getEnvelopeEndpointWithUrlEncodedAuth } from '../api';
import type { Envelope, EnvelopeItemType, EventItem } from '../types-hoist/envelope';
import type { Event } from '../types-hoist/event';
import type { BaseTransportOptions, Transport, TransportMakeRequestResponse } from '../types-hoist/transport';
import { dsnFromString } from '../utils/dsn';
import { createEnvelope, forEachEnvelopeItem } from '../utils/envelope';

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
 * Key used in event.extra to provide routing information for the multiplexed transport.
 * Should contain an array of `{ dsn: string, release?: string }` objects.
 */
export const MULTIPLEXED_TRANSPORT_EXTRA_KEY = 'MULTIPLEXED_TRANSPORT_EXTRA_KEY';

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
      ...transport,
      send: async (envelope: Envelope): Promise<TransportMakeRequestResponse> => {
        const event = eventFromEnvelope(envelope, ['event', 'transaction', 'profile', 'replay_event']);

        if (event) {
          event.release = release;
        }
        return transport.send(envelope);
      },
    };
  };
}

/** Overrides the DSN in the envelope header  */
function overrideDsn(envelope: Envelope, dsn: string): Envelope {
  return createEnvelope(
    dsn
      ? {
          ...envelope[0],
          dsn,
        }
      : envelope[0],
    envelope[1],
  );
}

/**
 * Creates a transport that can send events to different DSNs depending on the envelope contents.
 *
 * If no matcher is provided, the transport will look for routing information in
 * `event.extra[MULTIPLEXED_TRANSPORT_EXTRA_KEY]`, which should contain
 * an array of `{ dsn: string, release?: string }` objects.
 */
export function makeMultiplexedTransport<TO extends BaseTransportOptions>(
  createTransport: (options: TO) => Transport,
  matcher?: Matcher,
): (options: TO) => Transport {
  return options => {
    const fallbackTransport = createTransport(options);
    const otherTransports: Map<string, Transport> = new Map();

    // Use provided matcher or default to simple multiplexed transport behavior
    const actualMatcher: Matcher =
      matcher ||
      (args => {
        const event = args.getEvent();
        if (
          event?.extra?.[MULTIPLEXED_TRANSPORT_EXTRA_KEY] &&
          Array.isArray(event.extra[MULTIPLEXED_TRANSPORT_EXTRA_KEY])
        ) {
          return event.extra[MULTIPLEXED_TRANSPORT_EXTRA_KEY];
        }
        return [];
      });

    function getTransport(dsn: string, release: string | undefined): [string, Transport] | undefined {
      // We create a transport for every unique dsn/release combination as there may be code from multiple releases in
      // use at the same time
      const key = release ? `${dsn}:${release}` : dsn;

      let transport = otherTransports.get(key);

      if (!transport) {
        const validatedDsn = dsnFromString(dsn);
        if (!validatedDsn) {
          return undefined;
        }
        const url = getEnvelopeEndpointWithUrlEncodedAuth(validatedDsn, options.tunnel);

        transport = release
          ? makeOverrideReleaseTransport(createTransport, release)({ ...options, url })
          : createTransport({ ...options, url });

        otherTransports.set(key, transport);
      }

      return [dsn, transport];
    }

    async function send(envelope: Envelope): Promise<TransportMakeRequestResponse> {
      function getEvent(types?: EnvelopeItemType[]): Event | undefined {
        const eventTypes: EnvelopeItemType[] = types?.length ? types : ['event'];
        return eventFromEnvelope(envelope, eventTypes);
      }

      const transports = actualMatcher({ envelope, getEvent })
        .map(result => {
          if (typeof result === 'string') {
            return getTransport(result, undefined);
          } else {
            return getTransport(result.dsn, result.release);
          }
        })
        .filter((t): t is [string, Transport] => !!t);

      // If we have no transports to send to, use the fallback transport
      // Don't override the DSN in the header for the fallback transport. '' is falsy
      const transportsWithFallback: [string, Transport][] = transports.length ? transports : [['', fallbackTransport]];

      const results = (await Promise.all(
        transportsWithFallback.map(([dsn, transport]) => transport.send(overrideDsn(envelope, dsn))),
      )) as [TransportMakeRequestResponse, ...TransportMakeRequestResponse[]];

      return results[0];
    }

    async function flush(timeout: number | undefined): Promise<boolean> {
      const allTransports = [...otherTransports.values(), fallbackTransport];
      const results = await Promise.all(allTransports.map(transport => transport.flush(timeout)));
      return results.every(r => r);
    }

    return {
      send,
      flush,
    };
  };
}
