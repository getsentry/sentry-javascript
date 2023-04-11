import { getCurrentHub, Hub, runWithAsyncContext, setAsyncContextStrategy } from '@sentry/core';

import { setBrowserErrorFrameAsyncContextStrategy } from '../../src/async';

describe('async browser context', () => {
  afterAll(() => {
    // clear the strategy
    setAsyncContextStrategy(undefined);
  });

  test('without context', () => {
    const hub = getCurrentHub();
    expect(hub).toEqual(new Hub());
  });

  test('without strategy hubs should be equal', () => {
    runWithAsyncContext(hub1 => {
      runWithAsyncContext(hub2 => {
        expect(hub1).toBe(hub2);
      });
    });
  });

  test('hub scope inheritance', () => {
    setBrowserErrorFrameAsyncContextStrategy();

    const globalHub = getCurrentHub();
    globalHub.setExtra('a', 'b');

    runWithAsyncContext(hub1 => {
      expect(hub1).toEqual(globalHub);

      hub1.setExtra('c', 'd');
      expect(hub1).not.toEqual(globalHub);

      runWithAsyncContext(hub2 => {
        expect(hub2).toEqual(hub1);
        expect(hub2).not.toEqual(globalHub);

        hub2.setExtra('e', 'f');
        expect(hub2).not.toEqual(hub1);
      });
    });
  });

  test('hub scope getCurrentHub', () => {
    setBrowserErrorFrameAsyncContextStrategy();

    const globalHub = getCurrentHub();
    globalHub.setExtra('a', 'b');

    runWithAsyncContext(hub1 => {
      expect(getCurrentHub()).toBe(hub1);
      runWithAsyncContext(hub2 => {
        expect(getCurrentHub()).toBe(hub2);
        runWithAsyncContext(hub3 => {
          expect(getCurrentHub()).toBe(hub3);
        });
      });
    });
  });

  test('context single instance', () => {
    setBrowserErrorFrameAsyncContextStrategy();

    runWithAsyncContext(hub => {
      expect(hub).toBe(getCurrentHub());
    });
  });

  test('context within a context not reused', () => {
    setBrowserErrorFrameAsyncContextStrategy();

    runWithAsyncContext(hub1 => {
      runWithAsyncContext(hub2 => {
        expect(hub1).not.toBe(hub2);
      });
    });
  });

  test('context within a context reused when requested', () => {
    setBrowserErrorFrameAsyncContextStrategy();

    runWithAsyncContext(hub1 => {
      runWithAsyncContext(
        hub2 => {
          expect(hub1).toBe(hub2);
        },
        { reuseExisting: true },
      );
    });
  });

  test('concurrent hub contexts', done => {
    setBrowserErrorFrameAsyncContextStrategy();

    let d1done = false;
    let d2done = false;

    runWithAsyncContext(hub => {
      hub.getStack().push({ client: 'process' } as any);
      expect(hub.getStack()[1]).toEqual({ client: 'process' });
      // Just in case so we don't have to worry which one finishes first
      // (although it always should be d2)
      setTimeout(() => {
        d1done = true;
        if (d2done) {
          done();
        }
      });
    });

    runWithAsyncContext(hub => {
      hub.getStack().push({ client: 'local' } as any);
      expect(hub.getStack()[1]).toEqual({ client: 'local' });
      setTimeout(() => {
        d2done = true;
        if (d1done) {
          done();
        }
      });
    });
  });
});
