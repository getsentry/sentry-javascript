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
      d.exit();
    });
  });

  test('concurrent domain hubs', done => {
    const d1 = domain.create();
    const d2 = domain.create();

    d1.run(() => {
      getCurrentHub()
        .getStack()
        .push({ client: 'process' });

      setTimeout(() => {
        expect(getCurrentHub().getStack()[1]).toEqual({ client: 'process' });
        d1.exit();
      }, 50);
    });

    d2.run(() => {
      getCurrentHub()
        .getStack()
        .push({ client: 'local' });

      setTimeout(() => {
        expect(getCurrentHub().getStack()[1]).toEqual({ client: 'local' });
        d2.exit();
        done();
      }, 100);
    });
  });
});
