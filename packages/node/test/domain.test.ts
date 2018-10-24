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
});
