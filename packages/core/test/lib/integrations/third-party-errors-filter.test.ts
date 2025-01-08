import type { Client } from '../../../src/client';
import { thirdPartyErrorFilterIntegration } from '../../../src/integrations/third-party-errors-filter';
import { addMetadataToStackFrames } from '../../../src/metadata';
import type { Event } from '../../../src/types-hoist';
import { nodeStackLineParser } from '../../../src/utils-hoist/node-stack-trace';
import { createStackParser } from '../../../src/utils-hoist/stacktrace';
import { GLOBAL_OBJ } from '../../../src/utils-hoist/worldwide';

function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

const stack = new Error().stack || '';
const stackParser = createStackParser(nodeStackLineParser());

const eventWithThirdAndFirstPartyFrames: Event = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            {
              colno: 1,
              filename: __filename,
              function: 'function',
              lineno: 1,
            },
            {
              colno: 2,
              filename: 'other-file.js',
              function: 'function',
              lineno: 2,
            },
          ],
        },
        type: 'SyntaxError',
        value: 'missing ( on line 10',
      },
    ],
  },
};

const eventWithOnlyFirstPartyFrames: Event = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            {
              colno: 1,
              filename: __filename,
              function: 'function',
              lineno: 1,
            },
            {
              colno: 2,
              filename: __filename,
              function: 'function',
              lineno: 2,
            },
          ],
        },
        type: 'SyntaxError',
        value: 'missing ( on line 10',
      },
    ],
  },
};

const eventWithOnlyThirdPartyFrames: Event = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            {
              colno: 1,
              filename: 'other-file.js',
              function: 'function',
              lineno: 1,
            },
            {
              colno: 2,
              filename: 'other-file.js',
              function: 'function',
              lineno: 2,
            },
          ],
        },
        type: 'SyntaxError',
        value: 'missing ( on line 10',
      },
    ],
  },
};

// This only needs the stackParser
const MOCK_CLIENT = {} as unknown as Client;

describe('ThirdPartyErrorFilter', () => {
  beforeEach(() => {
    GLOBAL_OBJ._sentryModuleMetadata = GLOBAL_OBJ._sentryModuleMetadata || {};
    GLOBAL_OBJ._sentryModuleMetadata[stack] = {
      '_sentryBundlerPluginAppKey:some-key': true,
      '_sentryBundlerPluginAppKey:some-other-key': true,
    };

    addMetadataToStackFrames(stackParser, eventWithThirdAndFirstPartyFrames);
    addMetadataToStackFrames(stackParser, eventWithOnlyFirstPartyFrames);
    addMetadataToStackFrames(stackParser, eventWithOnlyThirdPartyFrames);
  });

  describe('drop-error-if-contains-third-party-frames', () => {
    it('should keep event if there are exclusively first-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
    });

    it('should drop event if there is at least one third-party frame', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithThirdAndFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBe(null);
    });

    it('should drop event if all frames are third-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyThirdPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBe(null);
    });
  });

  describe('drop-error-if-exclusively-contains-third-party-frames', () => {
    it('should keep event if there are exclusively first-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
    });

    it('should keep event if there is at least one first-party frame', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithThirdAndFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
    });

    it('should drop event if all frames are third-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyThirdPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBe(null);
    });
  });

  describe('apply-tag-if-contains-third-party-frames', () => {
    it('should not tag event if exclusively contains first-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags?.third_party_code).toBeUndefined();
    });

    it('should tag event if contains at least one third-party frame', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithThirdAndFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags).toMatchObject({ third_party_code: true });
    });

    it('should tag event if contains exclusively third-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyThirdPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags).toMatchObject({ third_party_code: true });
    });
  });

  describe('apply-tag-if-exclusively-contains-third-party-frames', () => {
    it('should not tag event if exclusively contains first-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags?.third_party_code).toBeUndefined();
    });

    it('should not tag event if contains at least one first-party frame', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithThirdAndFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags?.third_party_code).toBeUndefined();
    });

    it('should tag event if contains exclusively third-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyThirdPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags).toMatchObject({ third_party_code: true });
    });
  });
});
