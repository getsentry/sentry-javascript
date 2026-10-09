import type { Transport } from '@sentry/core';
import { debug } from '@sentry/core';
import * as Sentry from '@sentry/node';
import type { NodeClientOptions } from '@sentry/node/build/types/types';
import { CpuProfilerBindings } from '@sentry/node-cpu-profiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _nodeProfilingIntegration } from '../src/integration';
import { NODE_VERSION } from '../src/nodeVersion';

function makeSpanProfilingClient(options: Partial<NodeClientOptions> = {}): [Sentry.NodeClient, Transport] {
  const integration = _nodeProfilingIntegration();
  const client = new Sentry.NodeClient({
    stackParser: Sentry.defaultStackParser,
    tracesSampleRate: 1,
    debug: true,
    environment: 'test-environment',
    dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
    integrations: [integration],
    transport: _opts =>
      Sentry.makeNodeTransport({
        url: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
        recordDroppedEvent: () => {
          return undefined;
        },
      }),
    ...options,
  });

  return [client, client.getTransport() as Transport];
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('ProfilingIntegration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('manual continuous profiling', () => {
    it('start and stops a profile session', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'manual',
        profileSessionSampleRate: 1,
      });
      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      Sentry.profiler.startProfiler();
      Sentry.profiler.stopProfiler();

      expect(startProfilingSpy).toHaveBeenCalled();
      expect(stopProfilingSpy).toHaveBeenCalled();
    });

    it('logs a no-op when stopping without a running profile session', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'manual',
        profileSessionSampleRate: 1,
      });
      Sentry.setCurrentClient(client);
      client.init();

      const debugLogSpy = vi.spyOn(debug, 'log');

      Sentry.profiler.stopProfiler();

      expect(debugLogSpy).toHaveBeenCalledWith('[Profiling] No profile session running, no-op.');
    });

    it('calling start and stop while profile session is running does nothing', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'manual',
        profileSessionSampleRate: 1,
      });
      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      Sentry.profiler.startProfiler();
      Sentry.profiler.startProfiler();

      expect(startProfilingSpy).toHaveBeenCalledTimes(1);

      Sentry.profiler.stopProfiler();
      Sentry.profiler.stopProfiler();

      expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
    });

    it('profileSessionSamplingRate is required', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'manual',
      });
      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      Sentry.profiler.startProfiler();
      Sentry.profiler.stopProfiler();

      expect(startProfilingSpy).not.toHaveBeenCalled();
      expect(stopProfilingSpy).not.toHaveBeenCalled();
    });

    it('profileSessionSamplingRate is respected', () => {
      const [client] = makeSpanProfilingClient({
        profileSessionSampleRate: 0,
        profileLifecycle: 'manual',
      });
      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      Sentry.profiler.startProfiler();
      Sentry.profiler.stopProfiler();

      expect(startProfilingSpy).not.toHaveBeenCalled();
      expect(stopProfilingSpy).not.toHaveBeenCalled();
    });

    describe('envelope', () => {
      beforeEach(() => {
        vi.useRealTimers();
      });

      it('sends a profile_chunk envelope type', async () => {
        const [client, transport] = makeSpanProfilingClient({
          profileLifecycle: 'manual',
          profileSessionSampleRate: 1,
        });

        Sentry.setCurrentClient(client);
        client.init();

        const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

        Sentry.profiler.startProfiler();
        await wait(1000);
        Sentry.profiler.stopProfiler();

        await Sentry.flush(1000);

        expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0]).toMatchObject({
          type: 'profile_chunk',
        });

        expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1]).toMatchObject({
          profiler_id: expect.any(String),
          chunk_id: expect.any(String),
          profile: expect.objectContaining({
            stacks: expect.any(Array),
          }),
        });
      });

      it('emits the `beforeEnvelope` hook for profile chunks', async () => {
        const [client, transport] = makeSpanProfilingClient({
          profileLifecycle: 'manual',
          profileSessionSampleRate: 1,
        });

        Sentry.setCurrentClient(client);
        client.init();

        vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

        const beforeEnvelope = vi.fn();
        client.on('beforeEnvelope', beforeEnvelope);

        Sentry.profiler.startProfiler();
        await wait(1000);
        Sentry.profiler.stopProfiler();

        await Sentry.flush(1000);

        expect(beforeEnvelope).toHaveBeenCalledTimes(1);
        expect(beforeEnvelope.mock.calls[0]?.[0]?.[1]?.[0]?.[0]).toMatchObject({
          type: 'profile_chunk',
        });
      });
    });
  });

  describe('trace profile lifecycle', () => {
    it('trace profile lifecycle ignores manual calls to start and stop', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      Sentry.profiler.startProfiler();
      Sentry.profiler.stopProfiler();

      expect(startProfilingSpy).not.toHaveBeenCalled();
      expect(stopProfilingSpy).not.toHaveBeenCalled();
    });

    it('does not start profiler when profile session is not sampled', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 0,
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

      const span = Sentry.startInactiveSpan({ forceTransaction: true, name: 'test' });

      expect(startProfilingSpy).not.toHaveBeenCalled();

      span.end();
    });

    it('starts profiler when first span is created', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 1,
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const span = Sentry.startInactiveSpan({ forceTransaction: true, name: 'test' });

      expect(startProfilingSpy).toHaveBeenCalled();
      expect(stopProfilingSpy).not.toHaveBeenCalled();

      span.end();
      expect(stopProfilingSpy).toHaveBeenCalled();
    });

    it('waits for the tail span to end before stopping the profiler', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 1,
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const first = Sentry.startInactiveSpan({ forceTransaction: true, name: 'test' });
      const second = Sentry.startInactiveSpan({ forceTransaction: true, name: 'child' });

      expect(startProfilingSpy).toHaveBeenCalled();
      expect(stopProfilingSpy).not.toHaveBeenCalled();

      first.end();
      expect(stopProfilingSpy).not.toHaveBeenCalled();

      second.end();
      expect(stopProfilingSpy).toHaveBeenCalled();
    });

    it('ending last span does not stop the profiler if first span is not ended', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 1,
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const first = Sentry.startInactiveSpan({ forceTransaction: true, name: 'test' });
      const second = Sentry.startInactiveSpan({ forceTransaction: true, name: 'child' });

      expect(startProfilingSpy).toHaveBeenCalled();

      second.end();
      expect(stopProfilingSpy).not.toHaveBeenCalled();

      first.end();
      expect(stopProfilingSpy).toHaveBeenCalled();
    });
    it('multiple calls to span.end do not restart the profiler', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 1,
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const first = Sentry.startInactiveSpan({ forceTransaction: true, name: 'test' });
      const second = Sentry.startInactiveSpan({ forceTransaction: true, name: 'child' });

      expect(startProfilingSpy).toHaveBeenCalled();

      first.end();
      first.end();
      expect(stopProfilingSpy).not.toHaveBeenCalled();

      second.end();
      expect(stopProfilingSpy).toHaveBeenCalled();
    });

    it('logs when it skips a trace because the root span is not sampled', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 1,
        tracesSampleRate: 0,
      });

      Sentry.setCurrentClient(client);
      client.init();

      const debugLogSpy = vi.spyOn(debug, 'log');

      Sentry.startInactiveSpan({ name: 'GET /users/:id' });

      expect(debugLogSpy).toHaveBeenCalledWith(
        '[Profiling] Not profiling trace because its root span was not sampled.',
      );
    });

    it('does not log skipped unsampled child spans', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 1,
        tracesSampleRate: 0,
      });

      Sentry.setCurrentClient(client);
      client.init();

      const rootSpan = Sentry.startInactiveSpan({ name: 'GET /users/:id' });
      const debugLogSpy = vi.spyOn(debug, 'log');

      Sentry.startInactiveSpan({ name: 'SELECT * FROM users', parentSpan: rootSpan });

      expect(debugLogSpy).not.toHaveBeenCalledWith(
        '[Profiling] Not profiling trace because its root span was not sampled.',
      );
    });

    it('does not start the profiler for unsampled spans', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 1,
        tracesSampleRate: 0,
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

      Sentry.startSpan({ name: 'root' }, () => {
        Sentry.startSpan({ name: 'child' }, () => {});
      });

      expect(startProfilingSpy).not.toHaveBeenCalled();
    });

    it('stops the profiler after the last sampled span ends, ignoring unsampled spans', () => {
      const [client] = makeSpanProfilingClient({
        profileLifecycle: 'trace',
        profileSessionSampleRate: 1,
        tracesSampler: ({ name }) => (name === 'sampled' ? 1 : 0),
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      Sentry.startSpan({ name: 'unsampled' }, () => {
        Sentry.startSpan({ name: 'unsampled-child' }, () => {});
      });

      Sentry.startSpan({ name: 'sampled' }, () => {
        Sentry.startSpan({ name: 'sampled-child' }, () => {});
        expect(startProfilingSpy).toHaveBeenCalledTimes(1);
        expect(stopProfilingSpy).not.toHaveBeenCalled();
      });

      expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
    });

    describe('envelope', () => {
      beforeEach(() => {
        vi.useRealTimers();
      });

      it('sends a profile_chunk envelope type', async () => {
        const [client, transport] = makeSpanProfilingClient({
          traceLifecycle: 'static',
          profileLifecycle: 'trace',
          profileSessionSampleRate: 1,
        });

        Sentry.setCurrentClient(client);
        client.init();

        const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

        const span = Sentry.startInactiveSpan({ forceTransaction: true, name: 'test' });
        await wait(1000);
        span.end();

        await Sentry.flush(1000);

        expect(transportSpy.mock.calls?.[1]?.[0]?.[1]?.[0]?.[0]).toMatchObject({
          type: 'transaction',
        });
        expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0]).toMatchObject({
          type: 'profile_chunk',
        });

        expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1]).toMatchObject({
          profiler_id: expect.any(String),
          chunk_id: expect.any(String),
          profile: expect.objectContaining({
            stacks: expect.any(Array),
          }),
        });
      });
    });
  });

  describe('chunk restart', () => {
    const lifecycles = [
      {
        profileLifecycle: 'manual',
        startProfiling: () => {
          Sentry.profiler.startProfiler();
          return () => Sentry.profiler.stopProfiler();
        },
      },
      {
        profileLifecycle: 'trace',
        startProfiling: () => {
          const span = Sentry.startInactiveSpan({ name: 'GET /users/:id' });
          return () => span.end();
        },
      },
    ] as const;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each(lifecycles)(
      'does not start a new chunk when $profileLifecycle profiling stops before the scheduled restart',
      ({ profileLifecycle, startProfiling }) => {
        const [client] = makeSpanProfilingClient({ profileLifecycle, profileSessionSampleRate: 1 });
        Sentry.setCurrentClient(client);
        client.init();

        const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
        const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');
        const debugLogSpy = vi.spyOn(debug, 'log');
        const stopProfiling = startProfiling();
        vi.advanceTimersToNextTimer();
        expect(stopProfilingSpy).toHaveBeenCalledTimes(1);

        stopProfiling();
        vi.runOnlyPendingTimers();

        expect(startProfilingSpy).toHaveBeenCalledTimes(1);
        expect(debugLogSpy).toHaveBeenCalledWith(
          '[Profiling] Profiling stopped before the next chunk started, cancelled the scheduled chunk.',
        );
      },
    );

    it.each(lifecycles)(
      'does not report a cancelled chunk when $profileLifecycle profiling stops after the restart',
      ({ profileLifecycle, startProfiling }) => {
        const [client] = makeSpanProfilingClient({ profileLifecycle, profileSessionSampleRate: 1 });
        Sentry.setCurrentClient(client);
        client.init();

        const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
        const debugLogSpy = vi.spyOn(debug, 'log');
        const stopProfiling = startProfiling();
        vi.advanceTimersToNextTimer();
        vi.runOnlyPendingTimers();
        expect(startProfilingSpy).toHaveBeenCalledTimes(2);

        stopProfiling();

        expect(debugLogSpy).not.toHaveBeenCalledWith(
          '[Profiling] Profiling stopped before the next chunk started, cancelled the scheduled chunk.',
        );
      },
    );
  });
});

describe('NODE_VERSION', () => {
  it('is a plain object without a custom toString', () => {
    // NODE_VERSION is a SemVer object from parseSemver — it has no custom toString().
    // Code should never interpolate it directly in a template literal.
    // Use process.versions.node or format the components manually instead.
    expect(`${NODE_VERSION}`).toBe('[object Object]');
    expect(`${NODE_VERSION.major}.${NODE_VERSION.minor}.${NODE_VERSION.patch}`).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
