import { InboundFilters } from '../../../src/integrations/inboundfilters';

let inboundFilters: InboundFilters;

describe('InboundFilters', () => {
  beforeEach(() => {
    inboundFilters = new InboundFilters();
  });

  describe('shouldDropEvent', () => {
    it('should drop when error is internal one', () => {
      inboundFilters.isSentryError = () => true;
      expect(inboundFilters.shouldDropEvent({}, inboundFilters.mergeOptions())).toBe(true);
    });

    it('should drop when error is ignored', () => {
      inboundFilters.isIgnoredError = () => true;
      expect(inboundFilters.shouldDropEvent({}, inboundFilters.mergeOptions())).toBe(true);
    });

    it('should drop when url is blacklisted', () => {
      inboundFilters.isBlacklistedUrl = () => true;
      expect(inboundFilters.shouldDropEvent({}, inboundFilters.mergeOptions())).toBe(true);
    });

    it('should drop when url is not whitelisted', () => {
      inboundFilters.isWhitelistedUrl = () => false;
      expect(inboundFilters.shouldDropEvent({}, inboundFilters.mergeOptions())).toBe(true);
    });

    it('should drop when url is not blacklisted, but also not whitelisted', () => {
      inboundFilters.isBlacklistedUrl = () => false;
      inboundFilters.isWhitelistedUrl = () => false;
      expect(inboundFilters.shouldDropEvent({}, inboundFilters.mergeOptions())).toBe(true);
    });

    it('should drop when url is blacklisted and whitelisted at the same time', () => {
      inboundFilters.isBlacklistedUrl = () => true;
      inboundFilters.isWhitelistedUrl = () => true;
      expect(inboundFilters.shouldDropEvent({}, inboundFilters.mergeOptions())).toBe(true);
    });

    it('should not drop when url is not blacklisted, but whitelisted', () => {
      inboundFilters.isBlacklistedUrl = () => false;
      inboundFilters.isWhitelistedUrl = () => true;
      expect(inboundFilters.shouldDropEvent({}, inboundFilters.mergeOptions())).toBe(false);
    });

    it('should not drop when any of checks dont match', () => {
      inboundFilters.isIgnoredError = () => false;
      inboundFilters.isBlacklistedUrl = () => false;
      inboundFilters.isWhitelistedUrl = () => true;
      expect(inboundFilters.shouldDropEvent({}, inboundFilters.mergeOptions())).toBe(false);
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
      expect(inboundFilters.isSentryError(messageEvent, inboundFilters.mergeOptions())).toBe(false);
      expect(inboundFilters.isSentryError(exceptionEvent, inboundFilters.mergeOptions())).toBe(false);
      expect(inboundFilters.isSentryError(sentryEvent, inboundFilters.mergeOptions())).toBe(true);
    });

    it('should be configurable', () => {
      inboundFilters = new InboundFilters({
        ignoreInternal: false,
      });
      expect(inboundFilters.isSentryError(messageEvent, inboundFilters.mergeOptions())).toBe(false);
      expect(inboundFilters.isSentryError(exceptionEvent, inboundFilters.mergeOptions())).toBe(false);
      expect(inboundFilters.isSentryError(sentryEvent, inboundFilters.mergeOptions())).toBe(false);
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
        inboundFilters.isIgnoredError(
          messageEvent,
          inboundFilters.mergeOptions({
            ignoreErrors: ['capture'],
          }),
        ),
      ).toBe(true);
    });

    it('string filter with exact match', () => {
      expect(
        inboundFilters.isIgnoredError(
          messageEvent,
          inboundFilters.mergeOptions({
            ignoreErrors: ['captureMessage'],
          }),
        ),
      ).toBe(true);
    });

    it('regexp filter with partial match', () => {
      expect(
        inboundFilters.isIgnoredError(
          messageEvent,
          inboundFilters.mergeOptions({
            ignoreErrors: [/capture/],
          }),
        ),
      ).toBe(true);
    });

    it('regexp filter with exact match', () => {
      expect(
        inboundFilters.isIgnoredError(
          messageEvent,
          inboundFilters.mergeOptions({
            ignoreErrors: [/^captureMessage$/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters.isIgnoredError(
          {
            message: 'captureMessageSomething',
          },
          inboundFilters.mergeOptions({
            ignoreErrors: [/^captureMessage$/],
          }),
        ),
      ).toBe(false);
    });

    it('uses message when both, message and exception are available', () => {
      expect(
        inboundFilters.isIgnoredError(
          {
            ...exceptionEvent,
            ...messageEvent,
          },
          inboundFilters.mergeOptions({
            ignoreErrors: [/captureMessage/],
          }),
        ),
      ).toBe(true);
    });

    it('can use multiple filters', () => {
      expect(
        inboundFilters.isIgnoredError(
          messageEvent,
          inboundFilters.mergeOptions({
            ignoreErrors: ['captureMessage', /SyntaxError/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters.isIgnoredError(
          exceptionEvent,
          inboundFilters.mergeOptions({
            ignoreErrors: ['captureMessage', /SyntaxError/],
          }),
        ),
      ).toBe(true);
    });

    it('uses default filters', () => {
      expect(
        inboundFilters.isIgnoredError(
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
          inboundFilters.mergeOptions(),
        ),
      ).toBe(true);
    });

    describe('on exception', () => {
      it('uses exceptions data when message is unavailable', () => {
        expect(
          inboundFilters.isIgnoredError(
            exceptionEvent,
            inboundFilters.mergeOptions({
              ignoreErrors: ['SyntaxError: unidentified ? at line 1337'],
            }),
          ),
        ).toBe(true);
      });

      it('can match on exception value', () => {
        expect(
          inboundFilters.isIgnoredError(
            exceptionEvent,
            inboundFilters.mergeOptions({
              ignoreErrors: [/unidentified \?/],
            }),
          ),
        ).toBe(true);
      });

      it('can match on exception type', () => {
        expect(
          inboundFilters.isIgnoredError(
            exceptionEvent,
            inboundFilters.mergeOptions({
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
        frames: [
          {
            filename: 'https://awesome-analytics.io/some/file.js',
          },
        ],
      },
    };
    const exceptionEvent = {
      exception: {
        values: [
          {
            stacktrace: { frames: [{ filename: 'https://awesome-analytics.io/some/file.js' }] },
          },
        ],
      },
    };

    it('should filter captured message based on its stack trace using string filter', () => {
      expect(
        inboundFilters.isBlacklistedUrl(
          messageEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters.isWhitelistedUrl(
          messageEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured message based on its stack trace using regexp filter', () => {
      expect(
        inboundFilters.isBlacklistedUrl(
          messageEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters.isWhitelistedUrl(
          messageEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
    });

    it('should not filter captured messages with no stacktraces', () => {
      expect(
        inboundFilters.isBlacklistedUrl(
          {
            message: 'any',
          },
          inboundFilters.mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters.isWhitelistedUrl(
          {
            message: 'any',
          },
          inboundFilters.mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured exception based on its stack trace using string filter', () => {
      expect(
        inboundFilters.isBlacklistedUrl(
          exceptionEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters.isWhitelistedUrl(
          exceptionEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });

    it('should filter captured exceptions based on its stack trace using regexp filter', () => {
      expect(
        inboundFilters.isBlacklistedUrl(
          exceptionEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: [/awesome-analytics\.io/],
            whitelistUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters.isWhitelistedUrl(
          exceptionEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: [/awesome-analytics\.io/],
            whitelistUrls: [/awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
    });

    it('should not filter events that doesnt pass the test', () => {
      expect(
        inboundFilters.isBlacklistedUrl(
          exceptionEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['some-other-domain.com'],
            whitelistUrls: ['some-other-domain.com'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters.isWhitelistedUrl(
          exceptionEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['some-other-domain.com'],
            whitelistUrls: ['some-other-domain.com'],
          }),
        ),
      ).toBe(false);
    });

    it('should be able to use multiple filters', () => {
      expect(
        inboundFilters.isBlacklistedUrl(
          exceptionEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['some-other-domain.com', /awesome-analytics\.io/],
            whitelistUrls: ['some-other-domain.com', /awesome-analytics\.io/],
          }),
        ),
      ).toBe(true);
      expect(
        inboundFilters.isWhitelistedUrl(
          exceptionEvent,
          inboundFilters.mergeOptions({
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
        inboundFilters.isBlacklistedUrl(
          malformedEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(false);
      expect(
        inboundFilters.isWhitelistedUrl(
          malformedEvent,
          inboundFilters.mergeOptions({
            blacklistUrls: ['https://awesome-analytics.io'],
            whitelistUrls: ['https://awesome-analytics.io'],
          }),
        ),
      ).toBe(true);
    });
  });
});
