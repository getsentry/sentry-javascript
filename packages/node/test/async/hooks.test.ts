/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Hub } from '@sentry/core';
import { getCurrentHub, runWithAsyncContext, setAsyncContextStrategy } from '@sentry/core';

import { setHooksAsyncContextStrategy , startCounter } from '../../src/async/hooks';
import { conditionalTest } from '../utils';

conditionalTest({ min: 12 })('async_hooks', () => {
  afterAll(() => {
    // clear the strategy
    setAsyncContextStrategy(undefined);
  });

  test('without strategy hubs should be equal', () => {
    runWithAsyncContext(() => {
      const hub1 = getCurrentHub();
      runWithAsyncContext(() => {
        const hub2 = getCurrentHub();
        expect(hub1).toBe(hub2);
      });
    });
  });

  test('hub scope inheritance', () => {
    setHooksAsyncContextStrategy();

    const globalHub = getCurrentHub();
    globalHub.setExtra('a', 'b');

    runWithAsyncContext(() => {
      const hub1 = getCurrentHub();
      expect(hub1).toEqual(globalHub);

      hub1.setExtra('c', 'd');
      expect(hub1).not.toEqual(globalHub);

      runWithAsyncContext(() => {
        const hub2 = getCurrentHub();
        expect(hub2).toEqual(hub1);
        expect(hub2).not.toEqual(globalHub);

        hub2.setExtra('e', 'f');
        expect(hub2).not.toEqual(hub1);
      });
    });
  });

  test('async hub scope inheritance', async () => {
    setHooksAsyncContextStrategy();

    async function addRandomExtra(hub: Hub, key: string): Promise<void> {
      return new Promise(resolve => {
        setTimeout(() => {
          hub.setExtra(key, Math.random());
          resolve();
        }, 100);
      });
    }

    const globalHub = getCurrentHub();
    await addRandomExtra(globalHub, 'a');

    await runWithAsyncContext(async () => {
      const hub1 = getCurrentHub();
      expect(hub1).toEqual(globalHub);

      await addRandomExtra(hub1, 'b');
      expect(hub1).not.toEqual(globalHub);

      await runWithAsyncContext(async () => {
        const hub2 = getCurrentHub();
        expect(hub2).toEqual(hub1);
        expect(hub2).not.toEqual(globalHub);

        await addRandomExtra(hub1, 'c');
        expect(hub2).not.toEqual(hub1);
      });
    });
  });

  test('context single instance', () => {
    setHooksAsyncContextStrategy();

    const globalHub = getCurrentHub();
    runWithAsyncContext(() => {
      expect(globalHub).not.toBe(getCurrentHub());
    });
  });

  test('context within a context not reused', () => {
    setHooksAsyncContextStrategy();

    runWithAsyncContext(() => {
      const hub1 = getCurrentHub();
      runWithAsyncContext(() => {
        const hub2 = getCurrentHub();
        expect(hub1).not.toBe(hub2);
      });
    });
  });

  test('context within a context reused when requested', () => {
    setHooksAsyncContextStrategy();

    runWithAsyncContext(() => {
      const hub1 = getCurrentHub();
      runWithAsyncContext(
        () => {
          const hub2 = getCurrentHub();
          expect(hub1).toBe(hub2);
        },
        { reuseExisting: true },
      );
    });
  });

  test('concurrent hub contexts', done => {
    setHooksAsyncContextStrategy();

    let d1done = false;
    let d2done = false;

    runWithAsyncContext(() => {
      const hub = getCurrentHub();
      hub.getStack().push({ client: 'process' } as any);
      expect(hub.getStack()[1]).toEqual({ client: 'process' });
      // Just in case so we don't have to worry which one finishes first
      // (although it always should be d2)
      setTimeout(() => {
        d1done = true;
        if (d2done) {
          done();
        }
      }, 0);
    });

    runWithAsyncContext(() => {
      const hub = getCurrentHub();
      hub.getStack().push({ client: 'local' } as any);
      expect(hub.getStack()[1]).toEqual({ client: 'local' });
      setTimeout(() => {
        d2done = true;
        if (d1done) {
          done();
        }
      }, 0);
    });
  });
});

describe('startCounter', () => {
  test('should track created and settled promises when locations and continuation are true', async () => {
    const trackPromises = startCounter({ locations: true, continuation: true });

    // Simulate promise creation and settlement
    const promise1 = new Promise((resolve) => setTimeout(resolve, 100));
    const promise2 = new Promise((resolve) => setTimeout(resolve, 200));

    // Wait for promises to settle
    await Promise.all([promise1, promise2]);

    // Call trackPromises to get the results
    const result = trackPromises();

    // Assert expected results
    expect(result.created).toBe(2); // Two promises were created
    expect(result.settled).toBe(2); // Two promises were settled
    expect(result.locations).toBeDefined(); // Locations are tracked
  });

  test('should track created and settled promises when locations is true and continuation is false', async () => {
    const trackPromises = startCounter({ locations: true, continuation: false });

    // Simulate promise creation and settlement
    const promise1 = new Promise((resolve) => setTimeout(resolve, 100));
    const promise2 = new Promise((resolve) => setTimeout(resolve, 200));

    // Wait for promises to settle
    await Promise.all([promise1, promise2]);

    // Call trackPromises to get the results
    const result = trackPromises();

    // Assert expected results
    expect(result.created).toBe(2); // Two promises were created
    expect(result.settled).toBe(2); // Two promises were settled
    expect(result.locations).toBeDefined(); // Locations are tracked
  });

  test('should track promises when locations and continuation are false', async () => {
    const trackPromises = startCounter({ locations: false, continuation: false });

    // Simulate promise creation and settlement
    const promise1 = new Promise((resolve) => setTimeout(resolve, 100));
    const promise2 = new Promise((resolve) => setTimeout(resolve, 200));

    // Wait for promises to settle
    await Promise.all([promise1, promise2]);

    // Call trackPromises to get the results
    const result = trackPromises();

    // Assert expected results
    expect(result.created).toBe(2); // Two promises were created
    expect(result.settled).toBe(2); // Two promises were settled
    expect(result.locations).toEqual({}); // Locations are not tracked
  });
});
