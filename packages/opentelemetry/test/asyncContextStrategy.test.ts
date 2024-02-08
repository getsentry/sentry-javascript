import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { Hub } from '@sentry/core';
import { getCurrentHub } from '@sentry/core';
import { runWithAsyncContext, setAsyncContextStrategy } from '@sentry/core';

import { setOpenTelemetryContextAsyncContextStrategy } from '../src/asyncContextStrategy';
import { TestClient, getDefaultTestClientOptions } from './helpers/TestClient';
import { setupOtel } from './helpers/initOtel';
import { cleanupOtel } from './helpers/mockSdkInit';

describe('asyncContextStrategy', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    const options = getDefaultTestClientOptions();
    const client = new TestClient(options);
    provider = setupOtel(client);
    setOpenTelemetryContextAsyncContextStrategy();
  });

  afterEach(() => {
    cleanupOtel(provider);
  });

  afterAll(() => {
    // clear the strategy
    setAsyncContextStrategy(undefined);
  });

  test('hub scope inheritance', () => {
    // eslint-disable-next-line deprecation/deprecation
    const globalHub = getCurrentHub();
    // eslint-disable-next-line deprecation/deprecation
    globalHub.setExtra('a', 'b');

    runWithAsyncContext(() => {
      // eslint-disable-next-line deprecation/deprecation
      const hub1 = getCurrentHub();
      expect(hub1).toEqual(globalHub);

      // eslint-disable-next-line deprecation/deprecation
      hub1.setExtra('c', 'd');
      expect(hub1).not.toEqual(globalHub);

      runWithAsyncContext(() => {
        // eslint-disable-next-line deprecation/deprecation
        const hub2 = getCurrentHub();
        expect(hub2).toEqual(hub1);
        expect(hub2).not.toEqual(globalHub);

        // eslint-disable-next-line deprecation/deprecation
        hub2.setExtra('e', 'f');
        expect(hub2).not.toEqual(hub1);
      });
    });
  });

  test('async hub scope inheritance', async () => {
    async function addRandomExtra(hub: Hub, key: string): Promise<void> {
      return new Promise(resolve => {
        setTimeout(() => {
          // eslint-disable-next-line deprecation/deprecation
          hub.setExtra(key, Math.random());
          resolve();
        }, 100);
      });
    }

    // eslint-disable-next-line deprecation/deprecation
    const globalHub = getCurrentHub();
    await addRandomExtra(globalHub, 'a');

    await runWithAsyncContext(async () => {
      // eslint-disable-next-line deprecation/deprecation
      const hub1 = getCurrentHub();
      expect(hub1).toEqual(globalHub);

      await addRandomExtra(hub1, 'b');
      expect(hub1).not.toEqual(globalHub);

      await runWithAsyncContext(async () => {
        // eslint-disable-next-line deprecation/deprecation
        const hub2 = getCurrentHub();
        expect(hub2).toEqual(hub1);
        expect(hub2).not.toEqual(globalHub);

        await addRandomExtra(hub1, 'c');
        expect(hub2).not.toEqual(hub1);
      });
    });
  });

  test('context single instance', () => {
    // eslint-disable-next-line deprecation/deprecation
    const globalHub = getCurrentHub();
    runWithAsyncContext(() => {
      // eslint-disable-next-line deprecation/deprecation
      expect(globalHub).not.toBe(getCurrentHub());
    });
  });

  test('context within a context not reused', () => {
    runWithAsyncContext(() => {
      // eslint-disable-next-line deprecation/deprecation
      const hub1 = getCurrentHub();
      runWithAsyncContext(() => {
        // eslint-disable-next-line deprecation/deprecation
        const hub2 = getCurrentHub();
        expect(hub1).not.toBe(hub2);
      });
    });
  });

  test('context within a context reused when requested', () => {
    runWithAsyncContext(() => {
      // eslint-disable-next-line deprecation/deprecation
      const hub1 = getCurrentHub();
      runWithAsyncContext(
        () => {
          // eslint-disable-next-line deprecation/deprecation
          const hub2 = getCurrentHub();
          expect(hub1).toBe(hub2);
        },
        { reuseExisting: true },
      );
    });
  });

  test('concurrent hub contexts', done => {
    let d1done = false;
    let d2done = false;

    runWithAsyncContext(() => {
      // eslint-disable-next-line deprecation/deprecation
      const hub = getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      hub.getStack().push({ client: 'process' } as any);
      // eslint-disable-next-line deprecation/deprecation
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

    runWithAsyncContext(() => {
      // eslint-disable-next-line deprecation/deprecation
      const hub = getCurrentHub();
      // eslint-disable-next-line deprecation/deprecation
      hub.getStack().push({ client: 'local' } as any);
      // eslint-disable-next-line deprecation/deprecation
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
