import { InboundFilters } from '../../../src/integrations/inboundfilters';

let inboundFilters: any;

describe('InboundFilters', () => {
  beforeEach(() => {
    inboundFilters = new InboundFilters();
  });

  describe('shouldDropEvent', () => {
    it('should drop when error is internal one', () => {
      inboundFilters._isSentryError = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should drop when error is ignored', () => {
      inboundFilters._isIgnoredError = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should drop when url is excluded', () => {
      inboundFilters._isExcludedUrl = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should drop when url is not included', () => {
      inboundFilters._isIncludedUrl = () => false;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should drop when url is not excluded, but also not included', () => {
      inboundFilters._isExcludedUrl = () => false;
      inboundFilters._isIncludedUrl = () => false;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should drop when url is excluded and included at the same time', () => {
      inboundFilters._isExcludedUrl = () => true;
      inboundFilters._isIncludedUrl = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should not drop when url is not excluded, but included', () => {
      inboundFilters._isExcludedUrl = () => false;
      inboundFilters._isIncludedUrl = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(false);
    });

    it('should not drop when any of checks dont match', () => {
      inboundFilters._isIgnoredError = () => false;
      inboundFilters._isExcludedUrl = () => false;
      inboundFilters._isIncludedUrl = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(false);
    });
  });

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
      expect(inboundFilters._isSentryError(messageEvent, inboundFilters._mergeOptions())).toBe(false);
      expect(inboundFilters._isSentryError(exceptionEvent, inboundFilters._mergeOptions())).toBe(false);
      expect(inboundFilters._isSentryError(sentryEvent, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should be configurable', () => {
      inboundFilters = new InboundFilters({
        ignoreInternal: false,
      });
      expect(inboundFilters._isSentryError(messageEvent, inboundFilters._mergeOptions())).toBe(false);
      expect(inboundFilters._isSentryError(exceptionEvent, inboundFilters._mergeOptions())).toBe(false);
      expect(inboundFilters._isSentryError(sentryEvent, inboundFilters._mergeOptions())).toBe(false);
    });
  });

  describe('ignoreErrors', () => {
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

    it('string filter with partial match', () => {
      expect(
        inboundFilters._isIgnoredError(
          messageEvent,
          inboundFilters._mergeOptions({
            ignoreErrors: ['capture'],
          }),
        ),
      ).toBe(true);
    });

    it('string filter with exact match', () => {
      expect(
        inboundFilters._isIgnoredError(
          messageEvent,
          inboundFilters._mergeOptions({
            ignoreErrors: ['captureMessage'],
          }),
        ),
      ).toBe(true);
    });

    it('regexp filter with partial match', () => {
      expect(
        inboundFilters._isIgnoredError(
          messageEvent,
          inboundFilters._mergeOptions({
            ignoreErrors: [/capture/],
          }),
        ),
      ).toBe(true);
    });

    it('regexp filter with exact match', () => {
      expect(
        inboundFilters._isIgnoredError(
          messageEvent,
          inboundFilters._mergeOptions({
            ignoreErrors: [/^captureMessage$/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isIgnoredError(
          {
            message: 'captureMessageSomething',
          },
          inboundFilters._mergeOptions({
            ignoreErrors: [/^captureMessage$/],
          }),
        ),
      ).toBe(false);
    });

    it('uses message when both, message and exception are available', () => {
      expect(
        inboundFilters._isIgnoredError(
          {
            ...exceptionEvent,
            ...messageEvent,
          },
          inboundFilters._mergeOptions({
            ignoreErrors: [/captureMessage/],
          }),
        ),
      ).toBe(true);
    });

    it('can use multiple filters', () => {
      expect(
        inboundFilters._isIgnoredError(
          messageEvent,
          inboundFilters._mergeOptions({
            ignoreErrors: ['captureMessage', /SyntaxError/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isIgnoredError(
          exceptionEvent,
          inboundFilters._mergeOptions({
            ignoreErrors: ['captureMessage', /SyntaxError/],
          }),
        ),
      ).toBe(true);
    });

    it('uses default filters', () => {
      expect(
        inboundFilters._isIgnoredError(
          {
            exception: {
              values: [
                {
                  type: '[undefined]',
                  value: 'Script error.',
                },
              ],
            },
          },
          inboundFilters._mergeOptions(),
        ),
      ).toBe(true);
    });

    describe('on exception', () => {
      it('uses exceptions data when message is unavailable', () => {
        expect(
          inboundFilters._isIgnoredError(
            exceptionEvent,
            inboundFilters._mergeOptions({
              ignoreErrors: ['SyntaxError: unidentified ? at line 1337'],
            }),
          ),
        ).toBe(true);
      });

      it('can match on exception value', () => {
        expect(
          inboundFilters._isIgnoredError(
            exceptionEvent,
            inboundFilters._mergeOptions({
              ignoreErrors: [/unidentified \?/],
            }),
          ),
        ).toBe(true);
      });

      it('can match on exception type', () => {
        expect(
          inboundFilters._isIgnoredError(
            exceptionEvent,
            inboundFilters._mergeOptions({
              ignoreErrors: [/^SyntaxError/],
            }),
          ),
        ).toBe(true);
      });
    });
  });

  describe('excludedUrls/includedUrls', () => {
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
      expect(
        inboundFilters._isExcludedUrl(
          messageEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['https://awesome-analytics.io'],
            includedUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isIncludedUrl(
          messageEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['https://awesome-analytics.io'],
            includedUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured message based on its stack trace using regexp filter', () => {
      expect(
        inboundFilters._isExcludedUrl(
          messageEvent,
          inboundFilters._mergeOptions({
            excludedUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isIncludedUrl(
          messageEvent,
          inboundFilters._mergeOptions({
            excludedUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
    });

    it('should not filter captured messages with no stacktraces', () => {
      expect(
        inboundFilters._isExcludedUrl(
          {
            message: 'any',
          },
          inboundFilters._mergeOptions({
            excludedUrls: ['https://awesome-analytics.io'],
            includedUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters._isIncludedUrl(
          {
            message: 'any',
          },
          inboundFilters._mergeOptions({
            excludedUrls: ['https://awesome-analytics.io'],
            includedUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured exception based on its stack trace using string filter', () => {
      expect(
        inboundFilters._isExcludedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['https://awesome-analytics.io'],
            includedUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isIncludedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['https://awesome-analytics.io'],
            includedUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured exceptions based on its stack trace using regexp filter', () => {
      expect(
        inboundFilters._isExcludedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            excludedUrls: [/awesome-analytics\.io/],
            includedUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isIncludedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            excludedUrls: [/awesome-analytics\.io/],
            includedUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
    });

    it('should not filter events that doesnt pass the test', () => {
      expect(
        inboundFilters._isExcludedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['some-other-domain.com'],
            includedUrls: ['some-other-domain.com'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters._isIncludedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['some-other-domain.com'],
            includedUrls: ['some-other-domain.com'],
          }),
        ),
      ).toBe(false);
    });

    it('should be able to use multiple filters', () => {
      expect(
        inboundFilters._isExcludedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['some-other-domain.com', /awesome-analytics\.io/],
            includedUrls: ['some-other-domain.com', /awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isIncludedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['some-other-domain.com', /awesome-analytics\.io/],
            includedUrls: ['some-other-domain.com', /awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
    });

    it('should not fail with malformed event event and default to false for isExcludedUrl and true for isIncludedUrl', () => {
      const malformedEvent = {
        stacktrace: {
          frames: undefined,
        },
      };
      expect(
        inboundFilters._isExcludedUrl(
          malformedEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['https://awesome-analytics.io'],
            includedUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters._isIncludedUrl(
          malformedEvent,
          inboundFilters._mergeOptions({
            excludedUrls: ['https://awesome-analytics.io'],
            includedUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });
  });
});
