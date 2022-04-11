import { getCurrentHub, Hub } from '@sentry/core';
import * as domain from 'domain';

// We need this import here to patch domain on the global object
import * as Sentry from '../src';

// TODO This is here because if we don't use the `Sentry` object, the 'concurrent domain hubs' test will fail. Is this a
// product of treeshaking?
Sentry.getCurrentHub();

describe('domains', () => {
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

    d2.run(() => {
      const hub = getCurrentHub();
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
