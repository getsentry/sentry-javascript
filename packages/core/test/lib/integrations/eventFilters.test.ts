import { describe, expect, it } from 'vitest';
import type { EventFiltersOptions } from '../../../src/integrations/eventFilters';
import { eventFiltersIntegration, inboundFiltersIntegration } from '../../../src/integrations/eventFilters';
import type { Event } from '../../../src/types-hoist/event';
import type { EventProcessor } from '../../../src/types-hoist/eventprocessor';
import type { Integration } from '../../../src/types-hoist/integration';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const PUBLIC_DSN = 'https://username@domain/123';

/**
 * Creates an instance of the eventFiltersIntegration and returns
 * the event processor that the eventFiltersIntegration creates.
 *
 * To test the eventFiltersIntegration, call this function and assert on
 * how the event processor handles an event. For example, if you set up the
 * event filters to filter out an SOME_EXCEPTION_EVENT.
 *
 * ```
 * // some options that cause SOME_EXCEPTION_EVENT to be filtered
 * const eventProcessor = eventFiltersIntegration(options);
 *
 * expect(eventProcessor(SOME_EXCEPTION_EVENT)).toBe(null);
 * ```
 *
 * @param options options passed into the InboundFilters integration
 * @param clientOptions options passed into the mock Sentry client
 */
function createEventFiltersEventProcessor(
  integrationFn: (opts: Partial<EventFiltersOptions>) => Integration,
  options: Partial<EventFiltersOptions> = {},
  clientOptions: Partial<EventFiltersOptions> = {},
): EventProcessor {
  const integration = integrationFn(options);

  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      ...clientOptions,
      defaultIntegrations: false,
      integrations: [integration],
    }),
  );

  client.init();

  const eventProcessors = client['_eventProcessors'];
  const eventProcessor = eventProcessors.find(processor => processor.id === integration.name);

  expect(eventProcessor).toBeDefined();
  return eventProcessor!;
}

// Fixtures

const MESSAGE_EVENT: Event = {
  message: 'captureMessage',
};

const MESSAGE_EVENT_2: Event = {
  message: 'captureMessageSomething',
};

const MESSAGE_EVENT_WITH_STACKTRACE: Event = {
  message: 'wat',
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

const MESSAGE_EVENT_WITH_ANON_LAST_FRAME: Event = {
  message: 'any',
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            { filename: 'https://our-side.com/js/bundle.js' },
            { filename: 'https://awesome-analytics.io/some/file.js' },
            { filename: '<anonymous>' },
          ],
        },
      },
    ],
  },
};

const MESSAGE_EVENT_WITH_NATIVE_LAST_FRAME: Event = {
  message: 'any',
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            { filename: 'https://our-side.com/js/bundle.js' },
            { filename: 'https://awesome-analytics.io/some/file.js' },
            { filename: '[native code]' },
          ],
        },
      },
    ],
  },
};

const EXCEPTION_EVENT: Event = {
  exception: {
    values: [
      {
        type: 'SyntaxError',
        value: 'unidentified ? at line 1337',
      },
    ],
  },
};

const EXCEPTION_EVENT_WITH_MESSAGE_AND_VALUE: Event = {
  message: 'ChunkError',
  exception: {
    values: [
      {
        type: 'SyntaxError',
        value: 'unidentified ? at line 1337',
      },
    ],
  },
};

const EXCEPTION_EVENT_WITH_FRAMES: Event = {
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

const EXCEPTION_EVENT_WITH_LINKED_ERRORS: Event = {
  exception: {
    values: [
      {
        type: 'ReferenceError',
        value: '`tooManyTreats` is not defined',
        stacktrace: {
          frames: [{ filename: 'https://secondary-error.com/' }],
        },
      },
      {
        type: 'TypeError',
        value: 'incorrect type given for parameter `chewToy`: Shoe',
        stacktrace: {
          frames: [{ filename: 'https://main-error.com/' }],
        },
      },
    ],
  },
};

const EXCEPTION_EVENT_WITH_AGGREGATE_ERRORS: Event = {
  exception: {
    values: [
      {
        type: 'ReferenceError',
        value: '`tooManyTreats` is not defined',
        stacktrace: {
          frames: [{ filename: 'https://secondary-error.com/' }],
        },
        mechanism: {
          type: 'generic',
          exception_id: 1,
          parent_id: 0,
        },
      },
      {
        type: 'TypeError',
        value: 'incorrect type given for parameter `chewToy`: Shoe',
        stacktrace: {
          frames: [{ filename: 'https://main-error.com/' }],
        },
        mechanism: {
          type: 'generic',
          exception_id: 0,
        },
      },
    ],
  },
};

const EXCEPTION_EVENT_WITH_LINKED_ERRORS_WITHOUT_STACKTRACE: Event = {
  exception: {
    values: [
      {
        type: 'ReferenceError',
        value: '`tooManyTreats` is not defined',
        stacktrace: {
          frames: [{ filename: 'https://main-error.com/' }],
        },
      },
      {
        type: 'TypeError',
        value: 'incorrect type given for parameter `chewToy`: Shoe',
      },
    ],
  },
};

const EXCEPTION_EVENT_WITH_AGGREGATE_ERRORS_WITHOUT_STACKTRACE: Event = {
  exception: {
    values: [
      {
        type: 'ReferenceError',
        value: '`tooManyTreats` is not defined',
        stacktrace: {
          frames: [{ filename: 'https://secondary-error.com/' }],
        },
        mechanism: {
          type: 'generic',
          exception_id: 1,
          parent_id: 0,
        },
      },
      {
        type: 'TypeError',
        value: 'incorrect type given for parameter `chewToy`: Shoe',
        mechanism: {
          type: 'generic',
          exception_id: 0,
        },
      },
    ],
  },
};

const USELESS_EXCEPTION_EVENT: Event = {
  exception: {
    values: [
      {},
      {
        mechanism: { type: 'auto.node.onunhandledrejection', handled: false },
      },
    ],
  },
};

const USELESS_ERROR_EXCEPTION_EVENT: Event = {
  exception: {
    values: [{ type: 'Error' }, {}],
  },
};

const EVENT_WITH_MESSAGE: Event = {
  message: 'hello',
};

const EVENT_WITH_STACKTRACE: Event = {
  exception: {
    values: [
      {},
      {
        stacktrace: {
          frames: [
            {
              abs_path: 'hello.js',
            },
          ],
        },
      },
    ],
  },
};

const EVENT_WITH_TYPE: Event = {
  exception: {
    values: [
      {},
      {
        type: 'MyCustomError',
      },
    ],
  },
};

const EVENT_WITH_VALUE: Event = {
  exception: {
    values: [
      {},
      {
        value: 'some error',
      },
    ],
  },
};

const SCRIPT_ERROR_EVENT: Event = {
  exception: {
    values: [
      {
        type: '[undefined]',
        value: 'Script error.',
      },
    ],
  },
};

const RESIZEOBSERVER_EVENT: Event = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'ResizeObserver loop completed with undelivered notifications.',
      },
    ],
  },
};

const GOOGLETAG_EVENT: Event = {
  exception: {
    values: [
      {
        type: 'TypeError',
        value: 'Cannot redefine property: googletag',
      },
    ],
  },
};

const GOOGLE_APP_GMO: Event = {
  exception: {
    values: [{ type: 'ReferenceError', value: "Can't find variable: gmo" }],
  },
};

const CEFSHARP_EVENT: Event = {
  exception: {
    values: [
      {
        type: 'TypeError',
        value:
          'Non-Error promise rejection captured with value: Object Not Found Matching Id:3, MethodName:simulateEvent, ParamCount:1',
      },
    ],
  },
};

const FB_MOBILE_BROWSER_EVENT: Event = {
  exception: {
    values: [
      {
        type: 'Error',
        value: 'Java exception was raised during method invocation',
      },
    ],
  },
};

const MALFORMED_EVENT: Event = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: undefined,
        },
      },
    ],
  },
};

const TRANSACTION_EVENT: Event = {
  message: 'transaction message',
  transaction: 'transaction name',
  type: 'transaction',
};

const TRANSACTION_EVENT_2: Event = {
  transaction: 'transaction name 2',
  type: 'transaction',
};

const TRANSACTION_EVENT_3: Event = {
  transaction: 'other name',
  type: 'transaction',
};

function createUndefinedIsNotAnObjectEvent(evaluatingStr: string): Event {
  return {
    exception: {
      values: [{ type: 'TypeError', value: `undefined is not an object (evaluating '${evaluatingStr}')` }],
    },
  };
}

describe.each([
  // eslint-disable-next-line deprecation/deprecation
  ['InboundFilters', inboundFiltersIntegration],
  ['EventFilters', eventFiltersIntegration],
])('%s', (_, integrationFn) => {
  describe('ignoreErrors', () => {
    it('string filter with partial match', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: ['capture'],
      });
      expect(eventProcessor(MESSAGE_EVENT, {})).toBe(null);
    });

    it('ignores transaction event for filtering', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: ['transaction'],
      });
      expect(eventProcessor(TRANSACTION_EVENT, {})).toBe(TRANSACTION_EVENT);
    });

    it('string filter with exact match', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: ['captureMessage'],
      });
      expect(eventProcessor(MESSAGE_EVENT, {})).toBe(null);
    });

    it('regexp filter with partial match', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: [/capture/],
      });
      expect(eventProcessor(MESSAGE_EVENT, {})).toBe(null);
    });

    it('regexp filter with exact match', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: [/^captureMessage$/],
      });
      expect(eventProcessor(MESSAGE_EVENT, {})).toBe(null);
      expect(eventProcessor(MESSAGE_EVENT_2, {})).toBe(MESSAGE_EVENT_2);
    });

    it('prefers message when both message and exception are available', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: [/captureMessage/],
      });
      const event = {
        ...EXCEPTION_EVENT,
        ...MESSAGE_EVENT,
      };
      expect(eventProcessor(event, {})).toBe(null);
    });

    it('can use multiple filters', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: ['captureMessage', /SyntaxError/],
      });
      expect(eventProcessor(MESSAGE_EVENT, {})).toBe(null);
      expect(eventProcessor(EXCEPTION_EVENT, {})).toBe(null);
    });

    it('uses default filters (script error)', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(SCRIPT_ERROR_EVENT, {})).toBe(null);
    });

    it('uses default filters (ResizeObserver)', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(RESIZEOBSERVER_EVENT, {})).toBe(null);
    });

    it('uses default filters (googletag)', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(GOOGLETAG_EVENT, {})).toBe(null);
    });

    it('uses default filters (Google App "gmo")', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(GOOGLE_APP_GMO, {})).toBe(null);
    });

    it('uses default filters (CEFSharp)', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(CEFSHARP_EVENT, {})).toBe(null);
    });

    it('uses default filters (FB Mobile Browser)', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(FB_MOBILE_BROWSER_EVENT, {})).toBe(null);
    });

    it("uses default filters (undefined is not an object (evaluating 'a.L'))", () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(createUndefinedIsNotAnObjectEvent('a.L'), {})).toBe(null);
    });

    it("uses default filters (undefined is not an object (evaluating 'a.K'))", () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(createUndefinedIsNotAnObjectEvent('a.K'), {})).toBe(null);
    });

    it("doesn't use default filters for (undefined is not an object (evaluating 'a.store'))", () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      const event = createUndefinedIsNotAnObjectEvent('a.store');
      expect(eventProcessor(event, {})).toBe(event);
    });

    it("doesn't use default filters for (undefined is not an object (evaluating 'this._perf.domInteractive'))", () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      const event = createUndefinedIsNotAnObjectEvent('a.store');
      expect(eventProcessor(event, {})).toBe(event);
    });

    it('filters on last exception when multiple present', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: ['incorrect type given for parameter `chewToy`'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_LINKED_ERRORS, {})).toBe(null);
    });

    it("doesn't filter on `cause` exception when multiple present", () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreErrors: ['`tooManyTreats` is not defined'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_LINKED_ERRORS, {})).toBe(EXCEPTION_EVENT_WITH_LINKED_ERRORS);
    });

    describe('on exception', () => {
      it('uses exception data when message is unavailable', () => {
        const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
          ignoreErrors: ['SyntaxError: unidentified ? at line 1337'],
        });
        expect(eventProcessor(EXCEPTION_EVENT, {})).toBe(null);
      });

      it('can match on exception value', () => {
        const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
          ignoreErrors: [/unidentified \?/],
        });
        expect(eventProcessor(EXCEPTION_EVENT, {})).toBe(null);
      });

      it('can match on exception type', () => {
        const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
          ignoreErrors: [/^SyntaxError/],
        });
        expect(eventProcessor(EXCEPTION_EVENT, {})).toBe(null);
      });

      it('should consider both `event.message` and the last exceptions `type` and `value`', () => {
        const messageEventProcessor = createEventFiltersEventProcessor(integrationFn, {
          ignoreErrors: [/^ChunkError/],
        });
        const valueEventProcessor = createEventFiltersEventProcessor(integrationFn, {
          ignoreErrors: [/^SyntaxError/],
        });
        expect(messageEventProcessor(EXCEPTION_EVENT_WITH_MESSAGE_AND_VALUE, {})).toBe(null);
        expect(valueEventProcessor(EXCEPTION_EVENT_WITH_MESSAGE_AND_VALUE, {})).toBe(null);
      });
    });
  });

  describe('ignoreTransactions', () => {
    it('string filter with partial match', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreTransactions: ['name'],
      });
      expect(eventProcessor(TRANSACTION_EVENT, {})).toBe(null);
    });

    it('ignores error event for filtering', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreTransactions: ['capture'],
      });
      expect(eventProcessor(MESSAGE_EVENT, {})).toBe(MESSAGE_EVENT);
    });

    it('string filter with exact match', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreTransactions: ['transaction name'],
      });
      expect(eventProcessor(TRANSACTION_EVENT, {})).toBe(null);
    });

    it('regexp filter with partial match', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreTransactions: [/name/],
      });
      expect(eventProcessor(TRANSACTION_EVENT, {})).toBe(null);
    });

    it('regexp filter with exact match', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreTransactions: [/^transaction name$/],
      });
      expect(eventProcessor(TRANSACTION_EVENT, {})).toBe(null);
      expect(eventProcessor(TRANSACTION_EVENT_2, {})).toBe(TRANSACTION_EVENT_2);
    });

    it('can use multiple filters', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        ignoreTransactions: ['transaction name 2', /transaction/],
      });
      expect(eventProcessor(TRANSACTION_EVENT, {})).toBe(null);
      expect(eventProcessor(TRANSACTION_EVENT_2, {})).toBe(null);
      expect(eventProcessor(TRANSACTION_EVENT_3, {})).toBe(TRANSACTION_EVENT_3);
    });

    it('uses default filters', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(SCRIPT_ERROR_EVENT, {})).toBe(null);
      expect(eventProcessor(TRANSACTION_EVENT, {})).toBe(TRANSACTION_EVENT);
    });

    it('disable default error filters', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, { disableErrorDefaults: true });
      expect(eventProcessor(SCRIPT_ERROR_EVENT, {})).toBe(SCRIPT_ERROR_EVENT);
    });
  });

  describe('denyUrls/allowUrls', () => {
    it('should filter captured message based on its stack trace using string filter', () => {
      const eventProcessorDeny = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessorDeny(MESSAGE_EVENT_WITH_STACKTRACE, {})).toBe(null);
    });

    it('should allow denyUrls to take precedence', () => {
      const eventProcessorBoth = createEventFiltersEventProcessor(integrationFn, {
        allowUrls: ['https://awesome-analytics.io'],
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessorBoth(MESSAGE_EVENT_WITH_STACKTRACE, {})).toBe(null);
    });

    it('should filter captured message based on its stack trace using regexp filter', () => {
      const eventProcessorDeny = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: [/awesome-analytics\.io/],
      });
      expect(eventProcessorDeny(MESSAGE_EVENT_WITH_STACKTRACE, {})).toBe(null);
    });

    it('should not filter captured messages with no stacktraces', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(MESSAGE_EVENT, {})).toBe(MESSAGE_EVENT);
    });

    it('should filter captured exception based on its stack trace using string filter', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_FRAMES, {})).toBe(null);
    });

    it('should filter captured exception based on its stack trace using regexp filter', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: [/awesome-analytics\.io/],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_FRAMES, {})).toBe(null);
    });

    it("should not filter events that don't match the filtered values", () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['some-other-domain.com'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_FRAMES, {})).toBe(EXCEPTION_EVENT_WITH_FRAMES);
    });

    it('should be able to use multiple filters', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['some-other-domain.com', /awesome-analytics\.io/],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_FRAMES, {})).toBe(null);
    });

    it('should not fail with malformed event event', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['https://awesome-analytics.io'],
      });
      expect(eventProcessor(MALFORMED_EVENT, {})).toBe(MALFORMED_EVENT);
    });

    it('should search for script names when there is an anonymous callback at the last frame', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['https://awesome-analytics.io/some/file.js'],
      });
      expect(eventProcessor(MESSAGE_EVENT_WITH_ANON_LAST_FRAME, {})).toBe(null);
    });

    it('should search for script names when the last frame is from native code', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['https://awesome-analytics.io/some/file.js'],
      });
      expect(eventProcessor(MESSAGE_EVENT_WITH_NATIVE_LAST_FRAME, {})).toBe(null);
    });

    it('should apply denyUrls to the "root" error of a linked exception', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['https://main-error.com'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_LINKED_ERRORS, {})).toBe(null);
    });

    it('should apply denyUrls to the "root" error of an aggregate exception', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        denyUrls: ['https://main-error.com'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_AGGREGATE_ERRORS, {})).toBe(null);
    });

    it('should apply allowUrls to the "most root" exception in the event if there are exceptions without stacktrace', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        allowUrls: ['https://some-error-that-is-not-main-error.com'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_LINKED_ERRORS_WITHOUT_STACKTRACE, {})).toBe(null);
    });

    it('should not apply allowUrls to the event when the "root" exception of an aggregate error doesn\'t have a stacktrace', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn, {
        allowUrls: ['https://some-error-that-doesnt-match-anything.com'],
      });
      expect(eventProcessor(EXCEPTION_EVENT_WITH_AGGREGATE_ERRORS_WITHOUT_STACKTRACE, {})).toBe(
        EXCEPTION_EVENT_WITH_AGGREGATE_ERRORS_WITHOUT_STACKTRACE,
      );
    });
  });

  describe('useless errors', () => {
    it("should drop event with exceptions that don't have any message, type or stack trace", () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(USELESS_EXCEPTION_EVENT, {})).toBe(null);
    });

    it('should drop event with just a generic error without stacktrace or message', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(USELESS_ERROR_EXCEPTION_EVENT, {})).toBe(null);
    });

    it('should not drop event with a message', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(EVENT_WITH_MESSAGE, {})).toBe(EVENT_WITH_MESSAGE);
    });

    it('should not drop event with an exception that has a type', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(EVENT_WITH_TYPE, {})).toBe(EVENT_WITH_TYPE);
    });

    it('should not drop event with an exception that has a stacktrace', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(EVENT_WITH_STACKTRACE, {})).toBe(EVENT_WITH_STACKTRACE);
    });

    it('should not drop event with an exception that has a value', () => {
      const eventProcessor = createEventFiltersEventProcessor(integrationFn);
      expect(eventProcessor(EVENT_WITH_VALUE, {})).toBe(EVENT_WITH_VALUE);
    });
  });
});
