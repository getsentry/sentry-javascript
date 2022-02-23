import { InboundFilters, InboundFiltersOptions } from '../../../src/integrations/inboundfilters';
import { EventProcessor } from '@sentry/types';

/** JSDoc */
function createInboundFilters(
  options: Partial<InboundFiltersOptions> = {},
  clientOptions: Partial<InboundFiltersOptions> = {},
): EventProcessor {
  const eventProcessors: EventProcessor[] = [];
  const inboundFilters = new InboundFilters(options);

  function addGlobalEventProcessor(callback: EventProcessor): void {
    eventProcessors.push(callback);
    expect(eventProcessors).toHaveLength(1);
  }

  function getCurrentHub(): any {
    return {
      getIntegration(_integration: any): any {
        // pretend integration is enabled
        return inboundFilters;
      },
      getClient(): any {
        return {
          getOptions: () => clientOptions,
        };
      },
    };
  }

  inboundFilters.setupOnce(addGlobalEventProcessor, getCurrentHub);

  return eventProcessors[0];
}

describe('InboundFilters', () => {
  describe('isSentryError', () => {
    const messageEvent = {
      message: 'captureMessage',
    };
    const exceptionEvent = {
      exception: {
        values: [
          {
            type: 'SyntaxError',
            value: 'unidentified ? at line 1337',
          },
        ],
      },
    };
    const sentryEvent = {
      exception: {
        values: [
          {
            type: 'SentryError',
            value: 'something something server connection',
          },
        ],
      },
    };

    it('should work as expected', () => {
      const eventProcessor = createInboundFilters();
      expect(eventProcessor(messageEvent)).toBe(messageEvent);
      expect(eventProcessor(exceptionEvent)).toBe(exceptionEvent);
      expect(eventProcessor(sentryEvent)).toBe(null);
    });

    it('should be configurable', () => {
      const eventProcessor = createInboundFilters({ ignoreInternal: false });
      expect(eventProcessor(messageEvent)).toBe(messageEvent);
      expect(eventProcessor(exceptionEvent)).toBe(exceptionEvent);
      expect(eventProcessor(sentryEvent)).toBe(sentryEvent);
    });
  });

  describe('ignoreErrors', () => {
    const messageEvent = {
      message: 'captureMessage',
    };
    const captureMessageSomethingEvent = {
      message: 'captureMessageSomething',
    };
    const exceptionEvent = {
      exception: {
        values: [
          {
            type: 'SyntaxError',
            value: 'unidentified ? at line 1337',
          },
        ],
      },
    };

    it('string filter with partial match', () => {
      const eventProcessor = createInboundFilters({
        ignoreErrors: ['capture'],
      });
      expect(eventProcessor(messageEvent)).toBe(null);
    });

    it('string filter with exact match', () => {
      const eventProcessor = createInboundFilters({
        ignoreErrors: ['captureMessage'],
      });
      expect(eventProcessor(messageEvent)).toBe(null);
    });

    it('regexp filter with partial match', () => {
      const eventProcessor = createInboundFilters({
        ignoreErrors: [/capture/],
      });
      expect(eventProcessor(messageEvent)).toBe(null);
    });

    it('regexp filter with exact match', () => {
      const eventProcessor = createInboundFilters({
        ignoreErrors: [/^captureMessage$/],
      });
      expect(eventProcessor(messageEvent)).toBe(null);
      expect(eventProcessor(captureMessageSomethingEvent)).toBe(captureMessageSomethingEvent);
    });

    it('uses message when both, message and exception are available', () => {
      const eventProcessor = createInboundFilters({
        ignoreErrors: [/captureMessage/],
      });
      const event = {
        ...exceptionEvent,
        ...messageEvent,
      };
      expect(eventProcessor(event)).toBe(null);
    });

    it('can use multiple filters', () => {
      const eventProcessor = createInboundFilters({
        ignoreErrors: ['captureMessage', /SyntaxError/],
      });
      expect(eventProcessor(messageEvent)).toBe(null);
      expect(eventProcessor(exceptionEvent)).toBe(null);
    });

    it('uses default filters', () => {
      const eventProcessor = createInboundFilters();
      const defaultEvent = {
        exception: {
          values: [
            {
              type: '[undefined]',
              value: 'Script error.',
            },
          ],
        },
      };
      expect(eventProcessor(defaultEvent)).toBe(null);
    });

    describe('on exception', () => {
      it('uses exceptions data when message is unavailable', () => {
        const eventProcessor = createInboundFilters({
          ignoreErrors: ['SyntaxError: unidentified ? at line 1337'],
        });
        expect(eventProcessor(exceptionEvent)).toBe(null);
      });

      it('can match on exception value', () => {
        const eventProcessor = createInboundFilters({
          ignoreErrors: [/unidentified \?/],
        });
        expect(eventProcessor(exceptionEvent)).toBe(null);
      });

      it('can match on exception type', () => {
        const eventProcessor = createInboundFilters({
          ignoreErrors: [/^SyntaxError/],
        });
        expect(eventProcessor(exceptionEvent)).toBe(null);
      });
    });
  });

  describe('denyUrls/allowUrls', () => {
    const messageEvent = {
      message: 'wat',
      stacktrace: {
        // Frames are always in the reverse order, as this is how Sentry expect them to come.
        // Frame that crashed is the last one, the one from awesome-analytics
        frames: [
          { filename: 'https://our-side.com/js/bundle.js' },
          { filename: 'https://our-side.com/js/bundle.js' },
          { filename: 'https://awesome-analytics.io/some/file.js' },
        ],
      },
    };
    const exceptionEvent = {
      exception: {
        values: [
          {
            stacktrace: {
              // Frames are always in the reverse order, as this is how Sentry expect them to come.
              // Frame that crashed is the last one, the one from awesome-analytics
              frames: [
                { filename: 'https://our-side.com/js/bundle.js' },
                { filename: 'https://our-side.com/js/bundle.js' },
                { filename: 'https://awesome-analytics.io/some/file.js' },
              ],
            },
          },
        ],
      },
    };

    it('should filter captured message based on its stack trace using string filter', () => {
      const eventProcessorBoth = createInboundFilters({
        allowUrls: ['https://awesome-analytics.io'],
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessorBoth(messageEvent)).toBe(null);
      const eventProcessorAllow = createInboundFilters({
        allowUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessorAllow(messageEvent)).toBe(messageEvent);
      const eventProcessorDeny = createInboundFilters({
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessorDeny(messageEvent)).toBe(null);
    });

    it('should filter captured message based on its stack trace using regexp filter', () => {
      const eventProcessorDeny = createInboundFilters({
        denyUrls: [/awesome-analytics\.io/],
      });
      expect(eventProcessorDeny(messageEvent)).toBe(null);
    });

    it('should not filter captured messages with no stacktraces', () => {
      const simpleMessage = {
        message: 'any',
      };
      const eventProcessor = createInboundFilters({
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(simpleMessage)).toBe(simpleMessage);
    });

    it('should filter captured exception based on its stack trace using string filter', () => {
      const eventProcessor = createInboundFilters({
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(exceptionEvent)).toBe(null);
    });

    it('should filter captured exceptions based on its stack trace using regexp filter', () => {
      const eventProcessor = createInboundFilters({
        denyUrls: [/awesome-analytics\.io/],
      });
      expect(eventProcessor(exceptionEvent)).toBe(null);
    });

    it('should not filter events that doesnt pass the test', () => {
      const eventProcessor = createInboundFilters({
        denyUrls: ['some-other-domain.com'],
      });
      expect(eventProcessor(exceptionEvent)).toBe(exceptionEvent);
    });

    it('should be able to use multiple filters', () => {
      const eventProcessor = createInboundFilters({
        denyUrls: ['some-other-domain.com', /awesome-analytics\.io/],
      });
      expect(eventProcessor(exceptionEvent)).toBe(null);
    });

    it('should not fail with malformed event event', () => {
      const malformedEvent = {
        stacktrace: {
          frames: undefined,
        },
      };
      const eventProcessor = createInboundFilters({
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(malformedEvent)).toBe(malformedEvent);
    });

    it('should search for script names when there is an anonymous callback at the last frame', () => {
      const messageEvent = {
        message: 'any',
        stacktrace: {
          frames: [
            { filename: 'https://our-side.com/js/bundle.js' },
            { filename: 'https://awesome-analytics.io/some/file.js' },
            { filename: '<anonymous>' },
          ],
        },
      };

      const eventProcessor = createInboundFilters({
        denyUrls: ['https://awesome-analytics.io/some/file.js'],
      });
      expect(eventProcessor(messageEvent)).toBe(null);
    });

    it('should search for script names when the last frame is from native code', () => {
      const messageEvent = {
        message: 'any',
        stacktrace: {
          frames: [
            { filename: 'https://our-side.com/js/bundle.js' },
            { filename: 'https://awesome-analytics.io/some/file.js' },
            { filename: '[native code]' },
          ],
        },
      };

      const eventProcessor = createInboundFilters({
        denyUrls: ['https://awesome-analytics.io/some/file.js'],
      });
      expect(eventProcessor(messageEvent)).toBe(null);
    });
  });
});
