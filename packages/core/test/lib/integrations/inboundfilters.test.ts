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

    it('should drop when url is blacklisted', () => {
      inboundFilters._isBlacklistedUrl = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should drop when url is not whitelisted', () => {
      inboundFilters._isWhitelistedUrl = () => false;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should drop when url is not blacklisted, but also not whitelisted', () => {
      inboundFilters._isBlacklistedUrl = () => false;
      inboundFilters._isWhitelistedUrl = () => false;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should drop when url is blacklisted and whitelisted at the same time', () => {
      inboundFilters._isBlacklistedUrl = () => true;
      inboundFilters._isWhitelistedUrl = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(true);
    });

    it('should not drop when url is not blacklisted, but whitelisted', () => {
      inboundFilters._isBlacklistedUrl = () => false;
      inboundFilters._isWhitelistedUrl = () => true;
      expect(inboundFilters._shouldDropEvent({}, inboundFilters._mergeOptions())).toBe(false);
    });

    it('should not drop when any of checks dont match', () => {
      inboundFilters._isIgnoredError = () => false;
      inboundFilters._isBlacklistedUrl = () => false;
      inboundFilters._isWhitelistedUrl = () => true;
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

  describe('blacklistUrls/whitelistUrls', () => {
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
        inboundFilters._isBlacklistedUrl(
          messageEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isWhitelistedUrl(
          messageEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured message based on its stack trace using regexp filter', () => {
      expect(
        inboundFilters._isBlacklistedUrl(
          messageEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isWhitelistedUrl(
          messageEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
    });

    it('should not filter captured messages with no stacktraces', () => {
      expect(
        inboundFilters._isBlacklistedUrl(
          {
            message: 'any',
          },
          inboundFilters._mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters._isWhitelistedUrl(
          {
            message: 'any',
          },
          inboundFilters._mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured exception based on its stack trace using string filter', () => {
      expect(
        inboundFilters._isBlacklistedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isWhitelistedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured exceptions based on its stack trace using regexp filter', () => {
      expect(
        inboundFilters._isBlacklistedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: [/awesome-analytics\.io/],
            whitelistUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isWhitelistedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: [/awesome-analytics\.io/],
            whitelistUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
    });

    it('should not filter events that doesnt pass the test', () => {
      expect(
        inboundFilters._isBlacklistedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['some-other-domain.com'],
            whitelistUrls: ['some-other-domain.com'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters._isWhitelistedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['some-other-domain.com'],
            whitelistUrls: ['some-other-domain.com'],
          }),
        ),
      ).toBe(false);
    });

    it('should be able to use multiple filters', () => {
      expect(
        inboundFilters._isBlacklistedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['some-other-domain.com', /awesome-analytics\.io/],
            whitelistUrls: ['some-other-domain.com', /awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters._isWhitelistedUrl(
          exceptionEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['some-other-domain.com', /awesome-analytics\.io/],
            whitelistUrls: ['some-other-domain.com', /awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
    });

    it('should not fail with malformed event event and default to false for isBlacklistedUrl and true for isWhitelistedUrl', () => {
      const malformedEvent = {
        stacktrace: {
          frames: undefined,
        },
      };
      expect(
        inboundFilters._isBlacklistedUrl(
          malformedEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters._isWhitelistedUrl(
          malformedEvent,
          inboundFilters._mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });
  });
});
