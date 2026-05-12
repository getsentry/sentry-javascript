import { describe, expect, it } from 'vitest';
import type { DsnComponents } from '../../build/types/types-hoist/dsn';
import type { DynamicSamplingContext } from '../../build/types/types-hoist/envelope';
import type { SdkInfo } from '../../src';
import { _enhanceEventWithSdkInfo, createEventEnvelope } from '../../src/envelope';
import type { Event } from '../../src/types-hoist/event';

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
