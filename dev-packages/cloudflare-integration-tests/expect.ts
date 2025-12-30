import type { Contexts, Envelope, Event, SdkInfo } from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { expect } from 'vitest';

export const UUID_MATCHER = expect.stringMatching(/^[\da-f]{32}$/);
export const UUID_V4_MATCHER = expect.stringMatching(
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
);
export const SHORT_UUID_MATCHER = expect.stringMatching(/^[\da-f]{16}$/);
export const ISO_DATE_MATCHER = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

function dropUndefinedKeys<T extends Record<string, unknown>>(obj: T): T {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete obj[key];
    }
  }
  return obj;
}

function getSdk(): SdkInfo {
  return {
    integrations: expect.any(Array),
    name: 'sentry.javascript.cloudflare',
    packages: [
      {
        name: 'npm:@sentry/cloudflare',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };
}

function defaultContexts(eventContexts: Contexts = {}): Contexts {
  return dropUndefinedKeys({
    trace: {
      trace_id: UUID_MATCHER,
      span_id: SHORT_UUID_MATCHER,
    },
    cloud_resource: { 'cloud.provider': 'cloudflare' },
    culture: { timezone: expect.any(String) },
    runtime: { name: 'cloudflare' },
    ...eventContexts,
  });
}

export function expectedEvent(event: Event): Event {
  return dropUndefinedKeys({
    event_id: UUID_MATCHER,
    timestamp: expect.any(Number),
    environment: 'production',
    platform: 'javascript',
    sdk: getSdk(),
    ...event,
    contexts: defaultContexts(event.contexts),
  });
}

export function eventEnvelope(event: Event, includeSampleRand = false): Envelope {
  return [
    {
      event_id: UUID_MATCHER,
      sent_at: ISO_DATE_MATCHER,
      sdk: { name: 'sentry.javascript.cloudflare', version: SDK_VERSION },
      trace: {
        environment: event.environment || 'production',
        public_key: 'public',
        trace_id: UUID_MATCHER,
        sample_rate: expect.any(String),
        ...(includeSampleRand && { sample_rand: expect.stringMatching(/^[01](\.\d+)?$/) }),
        sampled: expect.any(String),
        transaction: expect.any(String),
      },
    },
    [[{ type: 'event' }, expectedEvent(event)]],
  ];
}
