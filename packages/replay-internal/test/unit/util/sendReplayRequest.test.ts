import { describe, expect, it } from 'vitest';
import {
  RateLimitError,
  ReplayDurationLimitError,
  TransportStatusCodeError,
} from '../../../src/util/sendReplayRequest';

describe('Unit | util | sendReplayRequest', () => {
  describe('TransportStatusCodeError', () => {
    it('creates error with correct message', () => {
      const error = new TransportStatusCodeError(500);
      expect(error.message).toBe('Transport returned status code 500');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('RateLimitError', () => {
    it('creates error with correct message and stores rate limits', () => {
      const rateLimits = { all: 1234567890 };
      const error = new RateLimitError(rateLimits);
      expect(error.message).toBe('Rate limit hit');
      expect(error.rateLimits).toBe(rateLimits);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ReplayDurationLimitError', () => {
    it('creates error with correct message', () => {
      const error = new ReplayDurationLimitError();
      expect(error.message).toBe('Session is too long, not sending replay');
      expect(error).toBeInstanceOf(Error);
    });

    it('is distinguishable from other error types', () => {
      const durationError = new ReplayDurationLimitError();
      const rateLimitError = new RateLimitError({ all: 123 });
      const transportError = new TransportStatusCodeError(500);

      expect(durationError instanceof ReplayDurationLimitError).toBe(true);
      expect(durationError instanceof RateLimitError).toBe(false);
      expect(durationError instanceof TransportStatusCodeError).toBe(false);

      expect(rateLimitError instanceof ReplayDurationLimitError).toBe(false);
      expect(rateLimitError instanceof RateLimitError).toBe(true);

      expect(transportError instanceof ReplayDurationLimitError).toBe(false);
      expect(transportError instanceof TransportStatusCodeError).toBe(true);
    });
  });
});
