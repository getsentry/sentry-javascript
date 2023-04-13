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

  test('hub scope inheritance', () => {
    setDomainAsyncContextStrategy();

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

  test('async hub scope inheritance', async () => {
    setDomainAsyncContextStrategy();

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

    await runWithAsyncContext(async hub1 => {
      expect(hub1).toEqual(globalHub);

      await addRandomExtra(hub1, 'b');
      expect(hub1).not.toEqual(globalHub);

      await runWithAsyncContext(async hub2 => {
        expect(hub2).toEqual(hub1);
        expect(hub2).not.toEqual(globalHub);

        await addRandomExtra(hub1, 'c');
        expect(hub2).not.toEqual(hub1);
      });
    });
  });

  test('hub single instance', () => {
    setDomainAsyncContextStrategy();

    runWithAsyncContext(hub => {
      expect(hub).toBe(getCurrentHub());
    });
  });

  test('within a domain not reused', () => {
    setDomainAsyncContextStrategy();

    runWithAsyncContext(hub1 => {
      runWithAsyncContext(hub2 => {
        expect(hub1).not.toBe(hub2);
      });
    });
  });

  test('within a domain reused when requested', () => {
    setDomainAsyncContextStrategy();

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
    setDomainAsyncContextStrategy();

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
