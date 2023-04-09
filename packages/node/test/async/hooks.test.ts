import { getCurrentHub, Hub, runWithAsyncContext, setAsyncContextStrategy } from '@sentry/core';
import * as domain from 'domain';

import { setHooksAsyncContextStrategy } from '../../src/async/hooks';

describe('async hooks', () => {
  afterAll(() => {
    // clear the strategy
    setAsyncContextStrategy(undefined);
  });

  test('without hooks', () => {
    // @ts-ignore property active does not exist on domain
    expect(domain.active).toBeFalsy();
    const hub = getCurrentHub();
    expect(hub).toEqual(new Hub());
  });

  test('hub scope inheritance', () => {
    const globalHub = getCurrentHub();
    globalHub.configureScope(scope => {
      scope.setExtra('a', 'b');
      scope.setTag('a', 'b');
      scope.addBreadcrumb({ message: 'a' });
    });
    runWithAsyncContext(hub => {
      expect(globalHub).toEqual(hub);
    });
  });

  test('hub single instance', () => {
    setHooksAsyncContextStrategy();

    runWithAsyncContext(hub => {
      expect(hub).toBe(getCurrentHub());
    });
  });

  test('context within context', () => {
    setHooksAsyncContextStrategy();

    runWithAsyncContext(hub1 => {
      runWithAsyncContext(hub2 => {
        expect(hub1).not.toBe(hub2);
      });
    });
  });

  test('context within context reused', () => {
    setHooksAsyncContextStrategy();

    runWithAsyncContext(hub1 => {
      runWithAsyncContext(
        hub2 => {
          expect(hub1).toBe(hub2);
        },
        { reuseExisting: true },
      );
    });
  });

  test('concurrent contexts', done => {
    setHooksAsyncContextStrategy();

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
