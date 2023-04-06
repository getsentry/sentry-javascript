import { getCurrentHub, Hub, runWithAsyncContext, setAsyncContextStrategy } from '@sentry/core';
import * as domain from 'domain';

import { setDomainAsyncContextStrategy } from '../../src/async/domain';

describe('domains', () => {
  afterAll(() => {
    // clear the strategy
    setAsyncContextStrategy(undefined);
  });

  test('without domain', () => {
    // @ts-ignore property active does not exist on domain
    expect(domain.active).toBeFalsy();
    const hub = getCurrentHub();
    expect(hub).toEqual(new Hub());
  });

  test('domain hub scope inheritance', () => {
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

  test('domain hub single instance', () => {
    setDomainAsyncContextStrategy();

    runWithAsyncContext(hub => {
      expect(hub).toBe(getCurrentHub());
    });
  });

  test('concurrent domain hubs', done => {
    setDomainAsyncContextStrategy();

    getCurrentHub();

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
