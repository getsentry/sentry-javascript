import { getCurrentHub, Hub } from '@sentry/core';
import * as domain from 'domain';

describe('domains', () => {
  test('without domain', () => {
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
    const d = domain.create();
    d.run(() => {
      const hub = getCurrentHub();
      expect(globalHub).toEqual(hub);
    });
  });

  test('domain hub single instance', () => {
    const d = domain.create();
    d.run(() => {
      expect(getCurrentHub()).toBe(getCurrentHub());
    });
  });

  test('concurrent domain hubs', done => {
    const d1 = domain.create();
    const d2 = domain.create();
    let d1done = false;
    let d2done = false;

    d1.run(() => {
      const hub = getCurrentHub();
      hub.getStack().push({ client: 'process' });
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

    d2.run(() => {
      const hub = getCurrentHub();
      hub.getStack().push({ client: 'local' });
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
