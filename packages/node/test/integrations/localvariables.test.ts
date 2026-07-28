import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter, filterFrameVariables } from '../../src/integrations/local-variables/common';

describe('LocalVariables', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('filterFrameVariables', () => {
    const vars = { user: 'bob', password: 'hunter2', count: 42 };

    it('keeps all variables on `true` but scrubs sensitive names', () => {
      expect(filterFrameVariables(vars, true)).toEqual({ user: 'bob', password: '[Filtered]', count: 42 });
    });

    it('drops all variables on `false`', () => {
      expect(filterFrameVariables(vars, false)).toEqual({});
    });

    it('keeps only allowed variable names', () => {
      expect(filterFrameVariables(vars, { allow: ['user', 'count'] })).toEqual({
        user: 'bob',
        password: '[Filtered]',
        count: 42,
      });
    });

    it('filters denied variable names', () => {
      expect(filterFrameVariables(vars, { deny: ['count'] })).toEqual({
        user: 'bob',
        password: '[Filtered]',
        count: '[Filtered]',
      });
    });
  });

  describe('rateLimiter', () => {
    it('calls disable if exceeded', () =>
      new Promise<void>(done => {
        const increment = createRateLimiter(
          5,
          () => {},
          () => {
            done();
          },
        );

        for (let i = 0; i < 7; i++) {
          increment();
          vi.advanceTimersByTime(100);
        }

        vi.advanceTimersByTime(1_000);
      }));

    it('does not call disable if not exceeded', () => {
      const increment = createRateLimiter(
        5,
        () => {
          throw new Error('Should not be called');
        },
        () => {
          throw new Error('Should not be called');
        },
      );

      for (let i = 0; i < 4; i++) {
        increment();
        vi.advanceTimersByTime(200);
      }

      vi.advanceTimersByTime(600);

      for (let i = 0; i < 4; i++) {
        increment();
        vi.advanceTimersByTime(200);
      }
    });

    it('re-enables after timeout', () =>
      new Promise<void>(done => {
        let called = false;

        const increment = createRateLimiter(
          5,
          () => {
            expect(called).toEqual(true);
            done();
          },
          () => {
            expect(called).toEqual(false);
            called = true;
          },
        );

        for (let i = 0; i < 10; i++) {
          increment();
          vi.advanceTimersByTime(100);
        }

        vi.advanceTimersByTime(10_000);
      }));
  });
});
