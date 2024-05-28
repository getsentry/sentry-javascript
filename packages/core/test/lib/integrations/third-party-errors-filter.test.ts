import type { Client, Event } from '@sentry/types';
import { GLOBAL_OBJ, createStackParser, nodeStackLineParser } from '@sentry/utils';
import { thirdPartyErrorFilterIntegration } from '../../../src/integrations/third-party-errors-filter';

function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

const stack = new Error().stack || '';

const eventSomeFrames: Event = {
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

const eventAllFrames: Event = {
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

const eventNoFrames: Event = {
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
const MOCK_CLIENT = {
  getOptions: () => ({
    stackParser: createStackParser(nodeStackLineParser()),
  }),
} as unknown as Client;

describe('ThirdPartyErrorFilter', () => {
  beforeEach(() => {
    GLOBAL_OBJ._sentryModuleMetadata = GLOBAL_OBJ._sentryModuleMetadata || {};
    GLOBAL_OBJ._sentryModuleMetadata[stack] = { bundle_key: 'some-key' };
  });

  describe('drop-if-any-frames-not-matched', () => {
    it('should drop event if not all frames matched', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-if-every-frames-not-matched',
        filterKeys: ['some-key'],
      });

      const event = clone(eventSomeFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBe(null);
    });

    it('should keep event if all frames matched', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-if-every-frames-not-matched',
        filterKeys: ['some-key'],
      });

      const event = clone(eventAllFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
    });
  });

  describe('drop-if-some-frames-not-matched', () => {
    it('should drop event if not all frames matched', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-if-some-frames-not-matched',
        filterKeys: ['some-key'],
      });

      const event = clone(eventNoFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBe(null);
    });

    it('should keep event if all frames matched', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-if-some-frames-not-matched',
        filterKeys: ['some-key'],
      });

      const event = clone(eventSomeFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
    });
  });

  describe('apply-tag-if-any-frames-not-matched', () => {
    it('should tag event if not all frames matched', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-every-frames-not-matched',
        filterKeys: ['some-key'],
      });

      const event = clone(eventSomeFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
      expect(result?.tags).toEqual({ 'not-application-code': true });
    });

    it('should not tag event if all frames matched', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-every-frames-not-matched',
        filterKeys: ['some-key'],
      });

      const event = clone(eventAllFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
      expect(result?.tags).toBeUndefined();
    });
  });

  describe('apply-tag-if-some-frames-not-matched', () => {
    it('should tag event if not all frames matched', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-some-frames-not-matched',
        filterKeys: ['some-key'],
      });

      const event = clone(eventNoFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
      expect(result?.tags).toEqual({ 'not-application-code': true });
    });

    it('should not tag event if all frames matched', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-some-frames-not-matched',
        filterKeys: ['some-key'],
      });

      const event = clone(eventSomeFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
      expect(result?.tags).toBeUndefined();
    });
  });
});
