import { getEnvelopeEndpointWithUrlEncodedAuth } from '../api';
import { DEBUG_BUILD } from '../debug-build';
import type { Envelope, EnvelopeItemType, EventItem, MetricContainerItem } from '../types-hoist/envelope';
import type { Event } from '../types-hoist/event';
import type { SerializedMetric, SerializedMetricContainer } from '../types-hoist/metric';
import type { BaseTransportOptions, Transport, TransportMakeRequestResponse } from '../types-hoist/transport';
import { debug } from '../utils/debug-logger';
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
  getMetric(): SerializedMetric | undefined;
}

type RouteTo = { dsn: string; release: string };
type Matcher = (param: MatchParam) => (string | RouteTo)[];

/**
 * Key used in event.extra to provide routing information for the multiplexed transport.
 * Should contain an array of `{ dsn: string, release?: string }` objects.
 */
export const MULTIPLEXED_TRANSPORT_EXTRA_KEY = 'MULTIPLEXED_TRANSPORT_EXTRA_KEY';

export const MULTIPLEXED_METRIC_ROUTING_KEY = 'sentry.routing';

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
 * It iterates over metric containers in an envelope.
 */
function forEachMetricContainer(
  envelope: Envelope,
  callback: (container: SerializedMetricContainer, metrics: SerializedMetric[]) => void | boolean,
): void {
  forEachEnvelopeItem(envelope, (item, type) => {
    if (type === 'trace_metric') {
      const container = Array.isArray(item) ? (item[1] as SerializedMetricContainer) : undefined;
      if (container?.items) {
        return callback(container, container.items);
      }
    }
  });
}

/**
 * Gets a metric from an envelope.
 *
 * This is only exported for use in tests and advanced use cases.
 */
export function metricFromEnvelope(envelope: Envelope): SerializedMetric | undefined {
  let metric: SerializedMetric | undefined;

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type === 'trace_metric') {
      const container = Array.isArray(item) ? (item[1] as SerializedMetricContainer) : undefined;
      const containerItems = container?.items;
      if (containerItems) {
        metric = containerItems[0];
      }
    }
    return !!metric;
  });

  return metric;
}

/**
 * Applies the release to all metrics in an envelope.
 */
function applyReleaseToMetrics(envelope: Envelope, release: string): void {
  forEachMetricContainer(envelope, (container, metrics) => {
    container.items = metrics.map(metric => ({
      ...metric,
      attributes: {
        ...metric.attributes,
        'sentry.release': { type: 'string', value: release },
      },
    }));
  });
}

/**
 * It strips routing attributes from all metrics in an envelope.
 * This prevents the routing information from being sent to Sentry.
 */
function stripRoutingAttributesFromMetrics(envelope: Envelope): void {
  let strippedCount = 0;
  forEachMetricContainer(envelope, (_container, metrics) => {
    for (const metric of metrics) {
      if (metric.attributes && MULTIPLEXED_METRIC_ROUTING_KEY in metric.attributes) {
        DEBUG_BUILD && strippedCount++;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [MULTIPLEXED_METRIC_ROUTING_KEY]: _routing, ...restAttributes } = metric.attributes;
        metric.attributes = restAttributes;
      }
    }
  });
}

/**
 * Creates a transport that overrides the release on all events and metrics.
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

        applyReleaseToMetrics(envelope, release);

        return transport.send(envelope);
      },
    };
  };
}

/** Overrides the DSN in the envelope header  */
function overrideDsn(envelope: Envelope, dsn: string): Envelope {
  const clonedItems = envelope[1].map(item => {
    if (Array.isArray(item) && item[0]?.type === 'trace_metric') {
      const [header, container] = item as MetricContainerItem;
      return [
        { ...header },
        {
          ...container,
          items: container.items ? [...container.items] : [],
        },
      ];
    }
    return item;
  });

  return createEnvelope(
    dsn
      ? {
          ...envelope[0],
          dsn,
        }
      : envelope[0],
    clonedItems as (typeof envelope)[1],
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
        const metric = args.getMetric();
        if (metric?.attributes?.[MULTIPLEXED_METRIC_ROUTING_KEY]) {
          const routingAttr = metric.attributes[MULTIPLEXED_METRIC_ROUTING_KEY];
          DEBUG_BUILD && debug.log('[Multiplexed Transport] Found metric routing attribute:', routingAttr);

          let routingValue: unknown;
          if (typeof routingAttr === 'object' && routingAttr !== null && 'value' in routingAttr) {
            routingValue = routingAttr.value;
            if (typeof routingValue === 'string') {
              try {
                routingValue = JSON.parse(routingValue);
                DEBUG_BUILD && debug.log('[Multiplexed Transport] Parsed routing value:', routingValue);
              } catch (e) {
                DEBUG_BUILD && debug.warn('[Multiplexed Transport] Failed to parse routing JSON:', e);
                return [];
              }
            }
          } else {
            routingValue = routingAttr;
          }

          if (Array.isArray(routingValue)) {
            const validRoutes = routingValue.filter(
              (route): route is string | RouteTo =>
                route !== null &&
                route !== undefined &&
                (typeof route === 'string' || (typeof route === 'object' && 'dsn' in route)),
            );
            DEBUG_BUILD && debug.log('[Multiplexed Transport] Valid routes:', validRoutes);
            return validRoutes;
          }
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

      function getMetric(): SerializedMetric | undefined {
        return metricFromEnvelope(envelope);
      }

      const transports = actualMatcher({ envelope, getEvent, getMetric })
        .map(result => {
          if (typeof result === 'string') {
            return getTransport(result, undefined);
          } else {
            return getTransport(result.dsn, result.release);
          }
        })
        .filter((t): t is [string, Transport] => !!t);

      stripRoutingAttributesFromMetrics(envelope);

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
