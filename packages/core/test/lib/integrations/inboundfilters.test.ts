import { EventProcessor } from '@sentry/types';

import { InboundFilters, InboundFiltersOptions } from '../../../src/integrations/inboundfilters';

/** JSDoc */
function createInboundFiltersEventProcessor(
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
    it('should work as expected', () => {
      const eventProcessor = createInboundFiltersEventProcessor();
      expect(eventProcessor(MESSAGE_EVENT)).toBe(MESSAGE_EVENT);
      expect(eventProcessor(EXCEPTION_EVENT)).toBe(EXCEPTION_EVENT);
      expect(eventProcessor(SENTRY_EVENT)).toBe(null);
    });

    it('should be configurable', () => {
      const eventProcessor = createInboundFiltersEventProcessor({ ignoreInternal: false });
      expect(eventProcessor(MESSAGE_EVENT)).toBe(MESSAGE_EVENT);
      expect(eventProcessor(EXCEPTION_EVENT)).toBe(EXCEPTION_EVENT);
      expect(eventProcessor(SENTRY_EVENT)).toBe(SENTRY_EVENT);
    });
  });

  describe('ignoreErrors', () => {
    it('string filter with partial match', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        ignoreErrors: ['capture'],
      });
      expect(eventProcessor(MESSAGE_EVENT)).toBe(null);
    });

    it('string filter with exact match', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        ignoreErrors: ['captureMessage'],
      });
      expect(eventProcessor(MESSAGE_EVENT)).toBe(null);
    });

    it('regexp filter with partial match', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        ignoreErrors: [/capture/],
      });
      expect(eventProcessor(MESSAGE_EVENT)).toBe(null);
    });

    it('regexp filter with exact match', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        ignoreErrors: [/^captureMessage$/],
      });
      expect(eventProcessor(MESSAGE_EVENT)).toBe(null);
      expect(eventProcessor(MESSAGE_EVENT_2)).toBe(MESSAGE_EVENT_2);
    });

    it('uses message when both, message and exception are available', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        ignoreErrors: [/captureMessage/],
      });
      const event = {
        ...EXCEPTION_EVENT,
        ...MESSAGE_EVENT,
      };
      expect(eventProcessor(event)).toBe(null);
    });

    it('can use multiple filters', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        ignoreErrors: ['captureMessage', /SyntaxError/],
      });
      expect(eventProcessor(MESSAGE_EVENT)).toBe(null);
      expect(eventProcessor(EXCEPTION_EVENT)).toBe(null);
    });

    it('uses default filters', () => {
      const eventProcessor = createInboundFiltersEventProcessor();
      expect(eventProcessor(DEFAULT_EVENT)).toBe(null);
    });

    describe('on exception', () => {
      it('uses exceptions data when message is unavailable', () => {
        const eventProcessor = createInboundFiltersEventProcessor({
          ignoreErrors: ['SyntaxError: unidentified ? at line 1337'],
        });
        expect(eventProcessor(EXCEPTION_EVENT)).toBe(null);
      });

      it('can match on exception value', () => {
        const eventProcessor = createInboundFiltersEventProcessor({
          ignoreErrors: [/unidentified \?/],
        });
        expect(eventProcessor(EXCEPTION_EVENT)).toBe(null);
      });

      it('can match on exception type', () => {
        const eventProcessor = createInboundFiltersEventProcessor({
          ignoreErrors: [/^SyntaxError/],
        });
        expect(eventProcessor(EXCEPTION_EVENT)).toBe(null);
      });
    });
  });

  describe('denyUrls/allowUrls', () => {
    it('should filter captured message based on its stack trace using string filter', () => {
      const eventProcessorBoth = createInboundFiltersEventProcessor({
        allowUrls: ['https://awesome-analytics.io'],
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessorBoth(MESSAGE_EVENT_WITH_STACKTRACE)).toBe(null);
      const eventProcessorAllow = createInboundFiltersEventProcessor({
        allowUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessorAllow(MESSAGE_EVENT_WITH_STACKTRACE)).toBe(MESSAGE_EVENT_WITH_STACKTRACE);
      const eventProcessorDeny = createInboundFiltersEventProcessor({
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessorDeny(MESSAGE_EVENT_WITH_STACKTRACE)).toBe(null);
    });

    it('should filter captured message based on its stack trace using regexp filter', () => {
      const eventProcessorDeny = createInboundFiltersEventProcessor({
        denyUrls: [/awesome-analytics\.io/],
      });
      expect(eventProcessorDeny(MESSAGE_EVENT_WITH_STACKTRACE)).toBe(null);
    });

    it('should not filter captured messages with no stacktraces', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(MESSAGE_EVENT)).toBe(MESSAGE_EVENT);
    });

    it('should filter captured exception based on its stack trace using string filter', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_FRAMES)).toBe(null);
    });

    it('should filter captured exceptions based on its stack trace using regexp filter', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        denyUrls: [/awesome-analytics\.io/],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_FRAMES)).toBe(null);
    });

    it('should not filter events that doesnt pass the test', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        denyUrls: ['some-other-domain.com'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_FRAMES)).toBe(EXCEPTION_EVENT_WITH_FRAMES);
    });

    it('should be able to use multiple filters', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        denyUrls: ['some-other-domain.com', /awesome-analytics\.io/],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_FRAMES)).toBe(null);
    });

    it('should not fail with malformed event event', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(MALFORMED_EVENT)).toBe(MALFORMED_EVENT);
    });

    it('should search for script names when there is an anonymous callback at the last frame', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        denyUrls: ['https://awesome-analytics.io/some/file.js'],
      });
      expect(eventProcessor(MESSAGE_EVENT_WITH_ANON_FRAME)).toBe(null);
    });

    it('should search for script names when the last frame is from native code', () => {
      const eventProcessor = createInboundFiltersEventProcessor({
        denyUrls: ['https://awesome-analytics.io/some/file.js'],
      });
      expect(eventProcessor(MESSAGE_EVENT_WITH_NATIVE_FRAME)).toBe(null);
    });
  });
});

// Fixtures

const MESSAGE_EVENT = {
  message: 'captureMessage',
};

const MESSAGE_EVENT_2 = {
  message: 'captureMessageSomething',
};

const MESSAGE_EVENT_WITH_STACKTRACE = {
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

const MESSAGE_EVENT_WITH_ANON_FRAME = {
  message: 'any',
  stacktrace: {
    frames: [
      { filename: 'https://our-side.com/js/bundle.js' },
      { filename: 'https://awesome-analytics.io/some/file.js' },
      { filename: '<anonymous>' },
    ],
  },
};

const MESSAGE_EVENT_WITH_NATIVE_FRAME = {
  message: 'any',
  stacktrace: {
    frames: [
      { filename: 'https://our-side.com/js/bundle.js' },
      { filename: 'https://awesome-analytics.io/some/file.js' },
      { filename: '[native code]' },
    ],
  },
};

const EXCEPTION_EVENT = {
  exception: {
    values: [
      {
        type: 'SyntaxError',
        value: 'unidentified ? at line 1337',
      },
    ],
  },
};

const EXCEPTION_EVENT_WITH_FRAMES = {
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

const SENTRY_EVENT = {
  exception: {
    values: [
      {
        type: 'SentryError',
        value: 'something something server connection',
      },
    ],
  },
};

const DEFAULT_EVENT = {
  exception: {
    values: [
      {
        type: '[undefined]',
        value: 'Script error.',
      },
    ],
  },
};

const MALFORMED_EVENT = {
  stacktrace: {
    frames: undefined,
  },
};
