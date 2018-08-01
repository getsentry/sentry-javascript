import { expect } from 'chai';
import { InboundFilters } from '../../src/integrations/inboundfilters';

let inboundFilters: InboundFilters;

describe('InboundFilters', () => {
  beforeEach(() => {
    inboundFilters = new InboundFilters();
  });

  describe('shouldDropEvent', () => {
    it('should drop when error is ignored', () => {
      inboundFilters.isIgnoredError = () => true;
      expect(inboundFilters.shouldDropEvent({})).equal(true);
    });

    it('should drop when url is blacklisted', () => {
      inboundFilters.isBlacklistedUrl = () => true;
      expect(inboundFilters.shouldDropEvent({})).equal(true);
    });

    it('should drop when url is not whitelisted', () => {
      inboundFilters.isWhitelistedUrl = () => false;
      expect(inboundFilters.shouldDropEvent({})).equal(true);
    });

    it('should drop when url is not blacklisted, but also not whitelisted', () => {
      inboundFilters.isBlacklistedUrl = () => false;
      inboundFilters.isWhitelistedUrl = () => false;
      expect(inboundFilters.shouldDropEvent({})).equal(true);
    });

    it('should drop when url is blacklisted and whitelisted at the same time', () => {
      inboundFilters.isBlacklistedUrl = () => true;
      inboundFilters.isWhitelistedUrl = () => true;
      expect(inboundFilters.shouldDropEvent({})).equal(true);
    });

    it('should not drop when url is not blacklisted, but whitelisted', () => {
      inboundFilters.isBlacklistedUrl = () => false;
      inboundFilters.isWhitelistedUrl = () => true;
      expect(inboundFilters.shouldDropEvent({})).equal(false);
    });

    it('should not drop when any of checks dont match', () => {
      inboundFilters.isIgnoredError = () => false;
      inboundFilters.isBlacklistedUrl = () => false;
      inboundFilters.isWhitelistedUrl = () => true;
      expect(inboundFilters.shouldDropEvent({})).equal(false);
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
      inboundFilters.install({
        ignoreErrors: ['capture'],
      });
      expect(inboundFilters.isIgnoredError(messageEvent)).equal(true);
    });

    it('string filter with exact match', () => {
      inboundFilters.install({
        ignoreErrors: ['captureMessage'],
      });
      expect(inboundFilters.isIgnoredError(messageEvent)).equal(true);
    });

    it('regexp filter with partial match', () => {
      inboundFilters.install({
        ignoreErrors: [/capture/],
      });
      expect(inboundFilters.isIgnoredError(messageEvent)).equal(true);
    });

    it('regexp filter with exact match', () => {
      inboundFilters.install({
        ignoreErrors: [/^captureMessage$/],
      });
      expect(inboundFilters.isIgnoredError(messageEvent)).equal(true);
      expect(
        inboundFilters.isIgnoredError({
          message: 'captureMessageSomething',
        }),
      ).equal(false);
    });

    it('uses message when both, message and exception are available', () => {
      inboundFilters.install({
        ignoreErrors: [/captureMessage/],
      });
      expect(
        inboundFilters.isIgnoredError({
          ...exceptionEvent,
          ...messageEvent,
        }),
      ).equal(true);
    });

    it('can use multiple filters', () => {
      inboundFilters.install({
        ignoreErrors: ['captureMessage', /SyntaxError/],
      });
      expect(inboundFilters.isIgnoredError(messageEvent)).equal(true);
      expect(inboundFilters.isIgnoredError(exceptionEvent)).equal(true);
    });

    describe('on exception', () => {
      it('uses exceptions data when message is unavailable', () => {
        inboundFilters.install({
          ignoreErrors: ['SyntaxError: unidentified ? at line 1337'],
        });
        expect(inboundFilters.isIgnoredError(exceptionEvent)).equal(true);
      });

      it('can match on exception value', () => {
        inboundFilters.install({
          ignoreErrors: [/unidentified \?/],
        });
        expect(inboundFilters.isIgnoredError(exceptionEvent)).equal(true);
      });

      it('can match on exception type', () => {
        inboundFilters.install({
          ignoreErrors: [/^SyntaxError/],
        });
        expect(inboundFilters.isIgnoredError(exceptionEvent)).equal(true);
      });
    });
  });

  describe('blacklistUrls/whitelistUrls', () => {
    const messageEvent = {
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
      inboundFilters.install({
        blacklistUrls: ['https://awesome-analytics.io'],
        whitelistUrls: ['https://awesome-analytics.io'],
      });
      expect(inboundFilters.isBlacklistedUrl(messageEvent)).equal(true);
      expect(inboundFilters.isWhitelistedUrl(messageEvent)).equal(true);
    });

    it('should filter captured message based on its stack trace using regexp filter', () => {
      inboundFilters.install({
        blacklistUrls: [/awesome-analytics\.io/],
      });
      expect(inboundFilters.isBlacklistedUrl(messageEvent)).equal(true);
      expect(inboundFilters.isWhitelistedUrl(messageEvent)).equal(true);
    });

    it('should filter captured exception based on its stack trace using string filter', () => {
      inboundFilters.install({
        blacklistUrls: ['https://awesome-analytics.io'],
        whitelistUrls: ['https://awesome-analytics.io'],
      });
      expect(inboundFilters.isBlacklistedUrl(exceptionEvent)).equal(true);
      expect(inboundFilters.isWhitelistedUrl(exceptionEvent)).equal(true);
    });

    it('should filter captured exceptions based on its stack trace using regexp filter', () => {
      inboundFilters.install({
        blacklistUrls: [/awesome-analytics\.io/],
        whitelistUrls: [/awesome-analytics\.io/],
      });
      expect(inboundFilters.isBlacklistedUrl(exceptionEvent)).equal(true);
      expect(inboundFilters.isWhitelistedUrl(exceptionEvent)).equal(true);
    });

    it('should not filter events that doesnt pass the test', () => {
      inboundFilters.install({
        blacklistUrls: ['some-other-domain.com'],
        whitelistUrls: ['some-other-domain.com'],
      });
      expect(inboundFilters.isBlacklistedUrl(exceptionEvent)).equal(false);
      expect(inboundFilters.isWhitelistedUrl(exceptionEvent)).equal(false);
    });

    it('should be able to use multiple filters', () => {
      inboundFilters.install({
        blacklistUrls: ['some-other-domain.com', /awesome-analytics\.io/],
        whitelistUrls: ['some-other-domain.com', /awesome-analytics\.io/],
      });
      expect(inboundFilters.isBlacklistedUrl(exceptionEvent)).equal(true);
      expect(inboundFilters.isWhitelistedUrl(exceptionEvent)).equal(true);
    });

    it('should not fail with malformed event event and default to false', () => {
      const malformedEvent = {
        stacktrace: {
          frames: undefined,
        },
      };
      inboundFilters.install({
        blacklistUrls: ['https://awesome-analytics.io'],
        whitelistUrls: ['https://awesome-analytics.io'],
      });
      expect(inboundFilters.isBlacklistedUrl(malformedEvent)).equal(false);
      expect(inboundFilters.isWhitelistedUrl(malformedEvent)).equal(false);
    });
  });
});
