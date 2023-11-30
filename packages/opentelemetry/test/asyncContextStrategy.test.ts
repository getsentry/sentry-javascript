import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { Hub } from '@sentry/core';
import { runWithAsyncContext, setAsyncContextStrategy } from '@sentry/core';

import { setOpenTelemetryContextAsyncContextStrategy } from '../src/asyncContextStrategy';
import { getCurrentHub } from '../src/custom/hub';
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
    const globalHub = getCurrentHub();
    runWithAsyncContext(() => {
      expect(globalHub).not.toBe(getCurrentHub());
    });
  });

  test('context within a context not reused', () => {
    runWithAsyncContext(() => {
      const hub1 = getCurrentHub();
      runWithAsyncContext(() => {
        const hub2 = getCurrentHub();
        expect(hub1).not.toBe(hub2);
      });
    });
  });

  test('context within a context reused when requested', () => {
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
      });
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
      });
    });
  });
});
