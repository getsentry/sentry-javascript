import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '../../../src/client';
import { thirdPartyErrorFilterIntegration } from '../../../src/integrations/third-party-errors-filter';
import { addMetadataToStackFrames } from '../../../src/metadata';
import type { Event } from '../../../src/types-hoist/event';
import { nodeStackLineParser } from '../../../src/utils/node-stack-trace';
import { createStackParser } from '../../../src/utils/stacktrace';
import { GLOBAL_OBJ } from '../../../src/utils/worldwide';

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
            // The following frames are native/built-in frames which should be ignored by the integration
            {
              function: 'Array.forEach',
              filename: '<anonymous>',
              abs_path: '<anonymous>',
              in_app: true,
            },
            {
              function: 'async Promise.all',
              filename: 'index 1',
              abs_path: 'index 1',
              in_app: true,
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
            },
            {
              filename: __filename,
              function: 'function',
              lineno: 2,
            },
            // The following frames are native/built-in frames which should be ignored by the integration
            {
              function: 'Array.forEach',
              filename: '<anonymous>',
              abs_path: '<anonymous>',
              in_app: true,
            },
            {
              function: 'async Promise.all',
              filename: 'index 1',
              abs_path: 'index 1',
              in_app: true,
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
            // The following frames are native/built-in frames which should be ignored by the integration
            {
              function: 'Array.forEach',
              filename: '<anonymous>',
              abs_path: '<anonymous>',
              in_app: true,
            },
            {
              function: 'async Promise.all',
              filename: 'index 1',
              abs_path: 'index 1',
              in_app: true,
            },
          ],
        },
        type: 'SyntaxError',
        value: 'missing ( on line 10',
      },
    ],
  },
};

const eventWithThirdPartyAndSentryInternalFrames: Event = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            {
              colno: 2,
              filename: '@sentry/browser/build/npm/esm/helpers.js',
              function: 'sentryWrapped',
              lineno: 117,
              context_line: '      return fn.apply(this, wrappedArguments);',
              pre_context: [
                '      // Attempt to invoke user-land function',
                '      // NOTE: If you are a Sentry user, and you are seeing this stack frame, it',
                '      //       means the sentry.javascript SDK caught an error invoking your application code. This',
              ],
            },
            {
              colno: 1,
              filename: 'other-file.js',
              function: 'function',
              lineno: 1,
            },
          ],
        },
        type: 'Error',
        value: 'Third party error',
      },
    ],
  },
};

const eventWithThirdPartySentryInternalAndFirstPartyFrames: Event = {
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
              filename: '@sentry/browser/build/npm/esm/helpers.js',
              function: 'sentryWrapped',
              lineno: 117,
              context_line: '      return fn.apply(this, wrappedArguments);',
              pre_context: [
                '      // Attempt to invoke user-land function',
                '      // NOTE: If you are a Sentry user, and you are seeing this stack frame, it',
                '      //       means the sentry.javascript SDK caught an error invoking your application code. This',
              ],
            },
            {
              colno: 3,
              filename: 'other-file.js',
              function: 'function',
              lineno: 3,
            },
          ],
        },
        type: 'Error',
        value: 'Mixed error',
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
    addMetadataToStackFrames(stackParser, eventWithThirdPartyAndSentryInternalFrames);
    addMetadataToStackFrames(stackParser, eventWithThirdPartySentryInternalAndFirstPartyFrames);
  });

  describe('drop-error-if-contains-third-party-frames', () => {
    it('keeps event if there are exclusively first-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
    });

    it('drops event if there is at least one third-party frame', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithThirdAndFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBe(null);
    });

    it('drops event if all frames are third-party frames', async () => {
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
    it('keeps event if there are exclusively first-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
    });

    it('keeps event if there is at least one first-party frame', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithThirdAndFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result).toBeDefined();
    });

    it('drops event if all frames are third-party frames', async () => {
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
    it("doesn't tag event if exclusively contains first-party frames", async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags?.third_party_code).toBeUndefined();
    });

    it('tags event if contains at least one third-party frame', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithThirdAndFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags).toMatchObject({ third_party_code: true });
    });

    it('tags event if contains exclusively third-party frames', async () => {
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
    it("doesn't tag event if exclusively contains first-party frames", async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags?.third_party_code).toBeUndefined();
    });

    it("doesn't tag event if contains at least one first-party frame", async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithThirdAndFirstPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags?.third_party_code).toBeUndefined();
    });

    it('tags event if contains exclusively third-party frames', async () => {
      const integration = thirdPartyErrorFilterIntegration({
        behaviour: 'apply-tag-if-exclusively-contains-third-party-frames',
        filterKeys: ['some-key'],
      });

      const event = clone(eventWithOnlyThirdPartyFrames);
      const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
      expect(result?.tags).toMatchObject({ third_party_code: true });
    });
  });

  describe('experimentalExcludeSentryInternalFrames', () => {
    describe('drop-error-if-exclusively-contains-third-party-frames', () => {
      it('drops event with only third-party + Sentry internal frames when option is enabled', async () => {
        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithThirdPartyAndSentryInternalFrames);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        expect(result).toBe(null);
      });

      it('keeps event with third-party + Sentry internal + first-party frames when option is enabled', async () => {
        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithThirdPartySentryInternalAndFirstPartyFrames);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        expect(result).toBeDefined();
      });

      it('does not drop event with only third-party + Sentry internal frames when option is disabled', async () => {
        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: false,
        });

        const event = clone(eventWithThirdPartyAndSentryInternalFrames);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        expect(result).toBeDefined();
      });

      it('defaults to false', async () => {
        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          // experimentalExcludeSentryInternalFrames not set, should default to false
        });

        const event = clone(eventWithThirdPartyAndSentryInternalFrames);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        // Should not drop because option defaults to false
        expect(result).toBeDefined();
      });
    });

    describe('drop-error-if-contains-third-party-frames', () => {
      it('drops event with third-party + Sentry internal frames when option is enabled', async () => {
        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithThirdPartyAndSentryInternalFrames);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        expect(result).toBe(null);
      });

      it('keeps event with third-party + Sentry internal + first-party frames when option is enabled', async () => {
        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithThirdPartySentryInternalAndFirstPartyFrames);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        // Should drop because it contains third-party frames (even with first-party frames)
        expect(result).toBe(null);
      });
    });

    describe('comment pattern detection', () => {
      it('detects Sentry internal frame by context_line with both patterns', async () => {
        const eventWithContextLine: Event = {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      colno: 2,
                      filename: '@sentry/browser/build/npm/esm/helpers.js',
                      function: 'sentryWrapped',
                      lineno: 117,
                      context_line: '      return fn.apply(this, wrappedArguments);',
                      pre_context: [
                        '      // Attempt to invoke user-land function',
                        '      // NOTE: If you are a Sentry user, and you are seeing this stack frame, it',
                      ],
                    },
                    {
                      colno: 1,
                      filename: 'other-file.js',
                      function: 'function',
                      lineno: 1,
                    },
                  ],
                },
                type: 'Error',
                value: 'Test error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithContextLine);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        expect(result).toBe(null);
      });

      it('detects Sentry internal frame by pre_context with both patterns', async () => {
        const eventWithPreContext: Event = {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      colno: 2,
                      filename: '@sentry/browser/build/npm/esm/helpers.js',
                      function: 'sentryWrapped',
                      lineno: 117,
                      context_line: '      return fn.apply(this, wrappedArguments);',
                      pre_context: [
                        '      // Attempt to invoke user-land function',
                        '      // NOTE: If you are a Sentry user, and you are seeing this stack frame, it',
                      ],
                    },
                    {
                      colno: 1,
                      filename: 'other-file.js',
                      function: 'function',
                      lineno: 1,
                    },
                  ],
                },
                type: 'Error',
                value: 'Test error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithPreContext);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        expect(result).toBe(null);
      });

      it('does not detect Sentry internal frame when fn.apply pattern is missing', async () => {
        const eventWithoutFnApply: Event = {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      colno: 2,
                      filename: '@sentry/browser/build/npm/esm/helpers.js',
                      function: 'sentryWrapped',
                      lineno: 115,
                      context_line: '      const wrappedArguments = args.map(arg => wrap(arg, options));',
                      post_context: [
                        '      // Attempt to invoke user-land function',
                        '      // NOTE: If you are a Sentry user',
                      ],
                    },
                    {
                      colno: 1,
                      filename: 'other-file.js',
                      function: 'function',
                      lineno: 1,
                    },
                  ],
                },
                type: 'Error',
                value: 'Test error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithoutFnApply);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        // Should not drop because fn.apply pattern is missing
        expect(result).toBeDefined();
      });

      it('does not match when Sentry internal frame is not the last frame', async () => {
        const eventWithSentryFrameNotLast: Event = {
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
                      filename: '@sentry/browser/build/npm/esm/helpers.js',
                      function: 'sentryWrapped',
                      lineno: 117,
                      context_line: '      return fn.apply(this, wrappedArguments);',
                      pre_context: [
                        '      // Attempt to invoke user-land function',
                        '      // NOTE: If you are a Sentry user, and you are seeing this stack frame, it',
                      ],
                    },
                    {
                      colno: 3,
                      filename: 'another-file.js',
                      function: 'function',
                      lineno: 3,
                    },
                  ],
                },
                type: 'Error',
                value: 'Test error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithSentryFrameNotLast);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        // Should not drop because Sentry frame is not the last frame
        expect(result).toBeDefined();
      });

      it('does not match when filename does not contain both helpers and sentry and function name is not sentryWrapped', async () => {
        const eventWithWrongFilename: Event = {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      colno: 2,
                      filename: 'some-helpers.js',
                      function: 'someFunction',
                      lineno: 117,
                      context_line: '      return fn.apply(this, wrappedArguments);',
                      pre_context: [
                        '      // Attempt to invoke user-land function',
                        '      // NOTE: If you are a Sentry user, and you are seeing this stack frame, it',
                      ],
                    },
                    {
                      colno: 1,
                      filename: 'other-file.js',
                      function: 'function',
                      lineno: 1,
                    },
                  ],
                },
                type: 'Error',
                value: 'Test error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithWrongFilename);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        // Should not drop because filename doesn't contain "sentry" and function name is not "sentryWrapped"
        expect(result).toBeDefined();
      });
    });

    describe('minified/bundled code detection', () => {
      afterEach(() => {
        GLOBAL_OBJ._sentryWrappedDepth = 0;
      });

      it('detects Sentry internal frame when processEvent runs inside a sentryWrapped call', async () => {
        const eventWithMinifiedSentryFrame: Event = {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      colno: 12345,
                      filename: 'https://example.com/assets/app-abc123.js',
                      function: 'a',
                      lineno: 1,
                    },
                    {
                      colno: 1,
                      filename: 'other-file.js',
                      function: 'function',
                      lineno: 1,
                    },
                  ],
                },
                type: 'Error',
                value: 'Third party error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        // Simulate being inside a sentryWrapped call
        GLOBAL_OBJ._sentryWrappedDepth = 1;
        try {
          const event = clone(eventWithMinifiedSentryFrame);
          const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
          expect(result).toBe(null);
        } finally {
          GLOBAL_OBJ._sentryWrappedDepth = 0;
        }
      });

      it('detects Sentry internal frame by function name sentryWrapped even without source patterns', async () => {
        const eventWithFunctionName: Event = {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      colno: 12345,
                      filename: 'https://example.com/assets/app-abc123.js',
                      function: 'sentryWrapped',
                      lineno: 1,
                    },
                    {
                      colno: 1,
                      filename: 'other-file.js',
                      function: 'function',
                      lineno: 1,
                    },
                  ],
                },
                type: 'Error',
                value: 'Third party error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        const event = clone(eventWithFunctionName);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        expect(result).toBe(null);
      });

      it('does not detect minified frame as Sentry internal when not inside sentryWrapped and function name is mangled', async () => {
        const eventWithMinifiedFrame: Event = {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      colno: 12345,
                      filename: 'https://example.com/assets/app-abc123.js',
                      function: 'a',
                      lineno: 1,
                    },
                    {
                      colno: 1,
                      filename: 'other-file.js',
                      function: 'function',
                      lineno: 1,
                    },
                  ],
                },
                type: 'Error',
                value: 'Third party error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: true,
        });

        GLOBAL_OBJ._sentryWrappedDepth = 0;
        const event = clone(eventWithMinifiedFrame);
        const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
        expect(result).toBeDefined();
      });

      it('does not use sentryWrappedDepth when ignoreSentryInternalFrames is false', async () => {
        const eventWithMinifiedSentryFrame: Event = {
          exception: {
            values: [
              {
                stacktrace: {
                  frames: [
                    {
                      colno: 12345,
                      filename: 'https://example.com/assets/app-abc123.js',
                      function: 'a',
                      lineno: 1,
                    },
                    {
                      colno: 1,
                      filename: 'other-file.js',
                      function: 'function',
                      lineno: 1,
                    },
                  ],
                },
                type: 'Error',
                value: 'Third party error',
              },
            ],
          },
        };

        const integration = thirdPartyErrorFilterIntegration({
          behaviour: 'drop-error-if-exclusively-contains-third-party-frames',
          filterKeys: ['some-key'],
          ignoreSentryInternalFrames: false,
        });

        GLOBAL_OBJ._sentryWrappedDepth = 1;
        try {
          const event = clone(eventWithMinifiedSentryFrame);
          const result = await integration.processEvent?.(event, {}, MOCK_CLIENT);
          expect(result).toBeDefined();
        } finally {
          GLOBAL_OBJ._sentryWrappedDepth = 0;
        }
      });
    });
  });

  // Regression test for https://github.com/getsentry/sentry-javascript/issues/20052
  // The thirdPartyErrorFilterIntegration triggers addMetadataToStackFrames on every error event,
  // which calls ensureMetadataStacksAreParsed to parse all _sentryModuleMetadata stack keys.
  // This test verifies that metadata is correctly resolved even when the module metadata stacks
  // contain long lines (e.g. from minified bundles with long URLs/identifiers).
  describe('metadata stack parsing with long stack lines', () => {
    it('resolves metadata for frames whose filenames appear in module metadata stacks with long URLs', () => {
      const longFilename = `https://example.com/_next/static/chunks/${'a'.repeat(200)}.js`;

      // Simulate a module metadata entry with a realistic stack containing a long filename
      const fakeStack = [`Error: Sentry Module Metadata`, `    at Object.<anonymous> (${longFilename}:1:1)`].join('\n');
      GLOBAL_OBJ._sentryModuleMetadata![fakeStack] = { '_sentryBundlerPluginAppKey:long-url-key': true };

      const event: Event = {
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ filename: longFilename, function: 'test', lineno: 1, colno: 1 }],
              },
            },
          ],
        },
      };

      addMetadataToStackFrames(stackParser, event);

      // The frame should have module_metadata attached from the parsed metadata stack
      const frame = event.exception!.values![0]!.stacktrace!.frames![0]!;
      expect(frame.module_metadata).toEqual({ '_sentryBundlerPluginAppKey:long-url-key': true });
    });
  });
});
