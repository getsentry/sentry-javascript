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

function getSdk(sdk: 'bun' | 'hono'): SdkInfo {
  return {
    integrations: expect.any(Array),
    name: `sentry.javascript.${sdk}`,
    packages: [
      {
        name: `npm:@sentry/${sdk}`,
        version: SDK_VERSION,
      },
      ...(sdk === 'hono' ? [{ name: 'npm:@sentry/bun', version: SDK_VERSION }] : []),
    ],
    version: SDK_VERSION,
  };
}

function defaultContexts(eventContexts: Contexts = {}): Contexts {
  return dropUndefinedKeys({
    app: { app_memory: expect.any(Number), app_start_time: expect.any(String), free_memory: expect.any(Number) },
    cloud_resource: expect.any(Object),
    trace: {
      trace_id: UUID_MATCHER,
      span_id: SHORT_UUID_MATCHER,
    },
    culture: { locale: expect.any(String), timezone: expect.any(String) },
    device: expect.any(Object),
    os: expect.any(Object),
    runtime: { name: 'bun', version: expect.any(String) },
    ...eventContexts,
  });
}

export function expectedEvent(event: Event, { sdk }: { sdk: 'bun' | 'hono' }): Event {
  return dropUndefinedKeys({
    event_id: UUID_MATCHER,
    timestamp: expect.any(Number),
    environment: 'production',
    platform: 'node',
    modules: expect.any(Object),
    sdk: getSdk(sdk),
    server_name: expect.any(String),
    // release is auto-detected from GitHub CI env vars, so only expect it if we know it will be there
    ...(process.env.GITHUB_SHA ? { release: expect.any(String) } : {}),
    ...event,
    contexts: defaultContexts(event.contexts),
  });
}

export function eventEnvelope(
  event: Event,
  {
    includeSampleRand = false,
    includeTransaction = true,
    sdk = 'bun',
  }: { includeSampleRand?: boolean; includeTransaction?: boolean; sdk?: 'bun' | 'hono' } = {},
): Envelope {
  return [
    {
      event_id: UUID_MATCHER,
      sent_at: ISO_DATE_MATCHER,
      sdk: { name: `sentry.javascript.${sdk}`, version: SDK_VERSION },
      trace: {
        environment: event.environment || 'production',
        public_key: 'public',
        trace_id: UUID_MATCHER,

        sample_rate: expect.any(String),
        sampled: expect.any(String),
        // release is auto-detected from GitHub CI env vars, so only expect it if we know it will be there
        ...(process.env.GITHUB_SHA ? { release: expect.any(String) } : {}),
        ...(includeSampleRand && { sample_rand: expect.stringMatching(/^[01](\.\d+)?$/) }),
        ...(includeTransaction && { transaction: expect.any(String) }),
      },
    },
    [[{ type: 'event' }, expectedEvent(event, { sdk })]],
  ];
}
