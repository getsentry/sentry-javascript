import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '../../src/integrations/local-variables/common';
import { createCallbackList } from '../../src/integrations/local-variables/local-variables-sync';
import { NODE_MAJOR } from '../../src/nodeVersion';

vi.useFakeTimers();

const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

describeIf(NODE_MAJOR >= 18)('LocalVariables', () => {
  describe('createCallbackList', () => {
    it('Should call callbacks in reverse order', () =>
      new Promise<void>(done => {
        const log: number[] = [];

        const { add, next } = createCallbackList<number>(n => {
          expect(log).toEqual([5, 4, 3, 2, 1]);
          expect(n).toBe(15);
          done();
        });

        add(n => {
          log.push(1);
          next(n + 1);
        });

        add(n => {
          log.push(2);
          next(n + 1);
        });

        add(n => {
          log.push(3);
          next(n + 1);
        });

        add(n => {
          log.push(4);
          next(n + 1);
        });

        add(n => {
          log.push(5);
          next(n + 11);
        });

        next(0);
      }));

    it('only calls complete once even if multiple next', () =>
      new Promise<void>(done => {
        const { add, next } = createCallbackList<number>(n => {
          expect(n).toBe(1);
          done();
        });

        add(n => {
          next(n + 1);
          // We dont actually do this in our code...
          next(n + 1);
        });

        next(0);
      }));

    it('calls completed if added closure throws', () =>
      new Promise<void>(done => {
        const { add, next } = createCallbackList<number>(n => {
          expect(n).toBe(10);
          done();
        });

        add(n => {
          throw new Error('test');
          next(n + 1);
        });

        next(10);
      }));
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
