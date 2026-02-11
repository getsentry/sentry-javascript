import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DsnComponents } from '../../build/types/types-hoist/dsn';
import type { DynamicSamplingContext } from '../../build/types/types-hoist/envelope';
import type { Client, SdkInfo } from '../../src';
import {
  getCurrentScope,
  getIsolationScope,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SentrySpan,
  setAsyncContextStrategy,
  setCurrentClient,
} from '../../src';
import { _enhanceEventWithSdkInfo, createEventEnvelope, createSpanEnvelope } from '../../src/envelope';
import type { Event } from '../../src/types-hoist/event';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

const testDsn: DsnComponents = { protocol: 'https', projectId: 'abc', host: 'testry.io', publicKey: 'pubKey123' };

describe('createEventEnvelope', () => {
  describe('trace header', () => {
    const testTable: Array<[string, Event, DynamicSamplingContext]> = [
      [
        'adds minimal baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            dynamicSamplingContext: { trace_id: '1234', public_key: 'pubKey123' },
          },
        },
        { trace_id: '1234', public_key: 'pubKey123' },
      ],
      [
        'adds multiple baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            dynamicSamplingContext: {
              environment: 'prod',
              release: '1.0.0',
              public_key: 'pubKey123',
              trace_id: '1234',
            },
          },
        },
        { release: '1.0.0', environment: 'prod', trace_id: '1234', public_key: 'pubKey123' },
      ],
      [
        'adds all baggage items',
        {
          type: 'transaction',
          sdkProcessingMetadata: {
            dynamicSamplingContext: {
              environment: 'prod',
              release: '1.0.0',
              transaction: 'TX',
              sample_rate: '0.95',
              public_key: 'pubKey123',
              trace_id: '1234',
            },
          },
        },
        {
          environment: 'prod',
          release: '1.0.0',
          transaction: 'TX',
          sample_rate: '0.95',
          public_key: 'pubKey123',
          trace_id: '1234',
        },
      ],
      [
        'with error event',
        {
          sdkProcessingMetadata: {
            dynamicSamplingContext: { trace_id: '1234', public_key: 'pubKey123' },
          },
        },
        { trace_id: '1234', public_key: 'pubKey123' },
      ],
    ];
    it.each(testTable)('%s', (_: string, event, trace) => {
      const envelopeHeaders = createEventEnvelope(event, testDsn)[0];

      expect(envelopeHeaders).toBeDefined();
      expect(envelopeHeaders.trace).toBeDefined();
      expect(envelopeHeaders.trace).toEqual(trace);
    });
  });
});

describe('createSpanEnvelope', () => {
  let client: Client | undefined;
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    setAsyncContextStrategy(undefined);
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, dsn: 'https://username@domain/123' });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // We want to avoid console errors in the tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates a span envelope', () => {
    const span = new SentrySpan({
      name: 'test',
      isStandalone: true,
      startTimestamp: 1,
      endTimestamp: 2,
      sampled: true,
      attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' },
    });

    const spanEnvelope = createSpanEnvelope([span]);

    const spanItem = spanEnvelope[1][0]?.[1];
    expect(spanItem).toEqual({
      data: {
        'sentry.origin': 'manual',
        'sentry.source': 'custom',
      },
      description: 'test',
      is_segment: true,
      origin: 'manual',
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      segment_id: spanItem?.segment_id,
      start_timestamp: 1,
      timestamp: 2,
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it('adds `trace` and `sent_at` envelope headers', () => {
    const spanEnvelope = createSpanEnvelope([
      new SentrySpan({ name: 'test', attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' } }),
    ]);

    const spanEnvelopeHeaders = spanEnvelope[0];
    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
      trace: {
        environment: 'production',
        public_key: 'username',
        sampled: 'false',
        trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
        transaction: 'test',
      },
    });
  });

  it('adds `dsn` envelope header if tunnel is enabled', () => {
    const options = getDefaultTestClientOptions({ dsn: 'https://username@domain/123', tunnel: 'http://tunnel' });
    const client = new TestClient(options);

    const spanEnvelope = createSpanEnvelope(
      [new SentrySpan({ name: 'test', attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' } })],
      client,
    );

    const spanEnvelopeHeaders = spanEnvelope[0];
    expect(spanEnvelopeHeaders.dsn).toEqual('https://username@domain/123');
  });

  it('does not add `dsn` envelope header if tunnel is not enabled', () => {
    const options = getDefaultTestClientOptions({ dsn: 'https://username@domain/123' });
    const client = new TestClient(options);

    const spanEnvelope = createSpanEnvelope(
      [new SentrySpan({ name: 'test', attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' } })],
      client,
    );

    const spanEnvelopeHeaders = spanEnvelope[0];
    expect(spanEnvelopeHeaders.dsn).toBeUndefined();
  });

  it("doesn't add a `trace` envelope header if there's no public key", () => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, dsn: 'https://domain/123' });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const spanEnvelope = createSpanEnvelope([new SentrySpan()]);

    const spanEnvelopeHeaders = spanEnvelope[0];
    expect(spanEnvelopeHeaders).toEqual({
      sent_at: expect.any(String),
    });
  });

  it('calls `beforeSendSpan` and uses original span without any changes', () => {
    const beforeSendSpan = vi.fn(span => span);
    const options = getDefaultTestClientOptions({ dsn: 'https://domain/123', beforeSendSpan });
    const client = new TestClient(options);

    const span = new SentrySpan({
      name: 'test',
      isStandalone: true,
      startTimestamp: 1,
      endTimestamp: 2,
    });

    const spanEnvelope = createSpanEnvelope([span], client);

    expect(beforeSendSpan).toHaveBeenCalled();

    const spanItem = spanEnvelope[1][0]?.[1];
    expect(spanItem).toEqual({
      data: {
        'sentry.origin': 'manual',
      },
      description: 'test',
      is_segment: true,
      origin: 'manual',
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      segment_id: spanItem?.segment_id,
      start_timestamp: 1,
      timestamp: 2,
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it('calls `beforeSendSpan` and uses the modified span', () => {
    const beforeSendSpan = vi.fn(span => {
      span.description = `mutated description: ${span.description}`;
      return span;
    });
    const options = getDefaultTestClientOptions({ dsn: 'https://domain/123', beforeSendSpan });
    const client = new TestClient(options);

    const span = new SentrySpan({
      name: 'test',
      isStandalone: true,
      startTimestamp: 1,
      endTimestamp: 2,
    });

    const spanEnvelope = createSpanEnvelope([span], client);

    expect(beforeSendSpan).toHaveBeenCalled();

    const spanItem = spanEnvelope[1][0]?.[1];
    expect(spanItem).toEqual({
      data: {
        'sentry.origin': 'manual',
      },
      description: 'mutated description: test',
      is_segment: true,
      origin: 'manual',
      span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
      segment_id: spanItem?.segment_id,
      start_timestamp: 1,
      timestamp: 2,
      trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });
});

describe('_enhanceEventWithSdkInfo', () => {
  it('does nothing if no new sdk info is provided', () => {
    const event: Event = {
      sdk: { name: 'original', version: '1.0.0' },
    };
    const enhancedEvent = _enhanceEventWithSdkInfo(event, undefined);
    expect(enhancedEvent.sdk).toEqual({ name: 'original', version: '1.0.0' });
  });

  /**
   * Note LS: I'm not sure if this is intended behaviour, but this is how it was before
   * I made implementation changes for the `settings` object. Documenting behaviour for now,
   * we can revisit it if it turns out this is not intended.
   */
  it('prefers original version and name over newSdkInfo', () => {
    const event: Event = {
      sdk: {
        name: 'original',
        version: '1.0.0',
        integrations: ['integration1', 'integration2'],
        packages: [{ name: '@sentry/browser', version: '10.0.0' }],
      },
    };
    const newSdkInfo: SdkInfo = { name: 'newName', version: '2.0.0' };

    const enhancedEvent = _enhanceEventWithSdkInfo(event, newSdkInfo);

    expect(enhancedEvent.sdk).toEqual({
      name: 'original',
      version: '1.0.0',
      integrations: ['integration1', 'integration2'],
      packages: [{ name: '@sentry/browser', version: '10.0.0' }],
    });
  });

  describe('integrations and packages', () => {
    it('merges integrations and packages of original and newSdkInfo', () => {
      const event: Event = {
        sdk: {
          name: 'original',
          version: '1.0.0',
          integrations: ['integration1', 'integration2'],
          packages: [{ name: '@sentry/browser', version: '10.0.0' }],
        },
      };

      const newSdkInfo: SdkInfo = {
        name: 'newName',
        version: '2.0.0',
        integrations: ['integration3', 'integration4'],
        packages: [{ name: '@sentry/node', version: '11.0.0' }],
      };

      const enhancedEvent = _enhanceEventWithSdkInfo(event, newSdkInfo);

      expect(enhancedEvent.sdk).toEqual({
        name: 'original',
        version: '1.0.0',
        integrations: ['integration1', 'integration2', 'integration3', 'integration4'],
        packages: [
          { name: '@sentry/browser', version: '10.0.0' },
          { name: '@sentry/node', version: '11.0.0' },
        ],
      });
    });

    it('creates empty integrations and packages arrays if no original or newSdkInfo are provided', () => {
      const event: Event = {
        sdk: {
          name: 'original',
          version: '1.0.0',
        },
      };

      const newSdkInfo: SdkInfo = {};

      const enhancedEvent = _enhanceEventWithSdkInfo(event, newSdkInfo);
      expect(enhancedEvent.sdk).toEqual({
        name: 'original',
        version: '1.0.0',
        integrations: [],
        packages: [],
      });
    });
  });

  describe('settings', () => {
    it('prefers newSdkInfo settings over original settings', () => {
      const event: Event = {
        sdk: {
          name: 'original',
          version: '1.0.0',
          integrations: ['integration1', 'integration2'],
          packages: [{ name: '@sentry/browser', version: '10.0.0' }],
          settings: { infer_ip: 'auto' },
        },
      };
      const newSdkInfo: SdkInfo = {
        settings: { infer_ip: 'never' },
      };

      const enhancedEvent = _enhanceEventWithSdkInfo(event, newSdkInfo);

      expect(enhancedEvent.sdk).toEqual({
        name: 'original',
        version: '1.0.0',
        integrations: ['integration1', 'integration2'],
        packages: [{ name: '@sentry/browser', version: '10.0.0' }],
        settings: { infer_ip: 'never' },
      });
    });

    it("doesn't create a `settings` object if no settings are provided", () => {
      const event: Event = {
        sdk: {
          name: 'original',
          version: '1.0.0',
        },
      };

      const newSdkInfo: SdkInfo = {
        packages: [{ name: '@sentry/browser', version: '10.0.0' }],
      };

      const enhancedEvent = _enhanceEventWithSdkInfo(event, newSdkInfo);
      expect(enhancedEvent.sdk).toEqual({
        name: 'original',
        version: '1.0.0',
        packages: [{ name: '@sentry/browser', version: '10.0.0' }],
        integrations: [],
        settings: undefined, // undefined is fine because JSON.stringify omits undefined values anyways
      });
    });
  });
});
