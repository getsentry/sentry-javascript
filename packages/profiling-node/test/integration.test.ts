import type { ProfileChunk, ProfilingIntegration, Transport } from '@sentry/core';
import { createEnvelope, debug, getMainCarrier, GLOBAL_OBJ } from '@sentry/core';
import * as Sentry from '@sentry/node';
import type { NodeClientOptions } from '@sentry/node/build/types/types';
import { CpuProfilerBindings } from '@sentry-internal/node-cpu-profiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _nodeProfilingIntegration } from '../src/integration';

function makeLegacySpanProfilingClient(): [Sentry.NodeClient, Transport] {
  const integration = _nodeProfilingIntegration();
  const client = new Sentry.NodeClient({
    stackParser: Sentry.defaultStackParser,
    tracesSampleRate: 1,
    profilesSampleRate: 1,
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
  });

  return [client, client.getTransport() as Transport];
}

function makeLegacyContinuousProfilingClient(): [Sentry.NodeClient, Transport] {
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
  });

  return [client, client.getTransport() as Transport];
}

function makeCurrentSpanProfilingClient(options: Partial<NodeClientOptions> = {}): [Sentry.NodeClient, Transport] {
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

function getProfilerId(): string {
  return (
    Sentry.getClient()?.getIntegrationByName<ProfilingIntegration<Sentry.NodeClient>>('ProfilingIntegration') as any
  )?._profiler?._profilerId;
}

function makeClientOptions(
  options: Omit<NodeClientOptions, 'stackParser' | 'integrations' | 'transport'>,
): NodeClientOptions {
  return {
    stackParser: Sentry.defaultStackParser,
    integrations: [_nodeProfilingIntegration()],
    debug: true,
    transport: _opts =>
      Sentry.makeNodeTransport({
        url: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
        recordDroppedEvent: () => {
          return undefined;
        },
      }),
    ...options,
  };
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('ProfilingIntegration', () => {
  describe('legacy automated span instrumentation', () => {
    beforeEach(() => {
      vi.useRealTimers();
      // We will mock the carrier as if it has been initialized by the SDK, else everything is short circuited
      getMainCarrier().__SENTRY__ = {};
      GLOBAL_OBJ._sentryDebugIds = undefined as any;
    });
    afterEach(() => {
      vi.clearAllMocks();
      vi.restoreAllMocks();
      delete getMainCarrier().__SENTRY__;
    });

    it('pulls environment from sdk init', async () => {
      const [client, transport] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);
      expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1]).toMatchObject({ environment: 'test-environment' });
    });

    it('logger warns user if there are insufficient samples and discards the profile', async () => {
      const logSpy = vi.spyOn(debug, 'log');

      const [client, transport] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      // @ts-expect-error we just mock the return type and ignore the signature
      vi.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
        return {
          samples: [
            {
              stack_id: 0,
              thread_id: '0',
              elapsed_since_start_ns: '10',
            },
          ],
          measurements: {},
          stacks: [[0]],
          frames: [],
          resources: [],
          profiler_logging_mode: 'lazy',
        };
      });

      vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      transaction.end();

      await Sentry.flush(1000);

      expect(logSpy).toHaveBeenCalledWith('[Profiling] Discarding profile because it contains less than 2 samples');

      expect((transport.send as any).mock.calls[0][0][1][0][0]?.type).toBe('transaction');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(transport.send).toHaveBeenCalledTimes(1);
    });

    it('logger warns user if traceId is invalid', async () => {
      const logSpy = vi.spyOn(debug, 'log');

      const [client, transport] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      // @ts-expect-error we just mock the return type and ignore the signature
      vi.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
        return {
          samples: [
            {
              stack_id: 0,
              thread_id: '0',
              elapsed_since_start_ns: '10',
            },
            {
              stack_id: 0,
              thread_id: '0',
              elapsed_since_start_ns: '10',
            },
          ],
          measurements: {},
          resources: [],
          stacks: [[0]],
          frames: [],
          profiler_logging_mode: 'lazy',
        };
      });

      vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

      Sentry.getCurrentScope().getPropagationContext().traceId = 'boop';
      const transaction = Sentry.startInactiveSpan({
        forceTransaction: true,
        name: 'profile_hub',
      });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);

      expect(logSpy).toHaveBeenCalledWith('[Profiling] Invalid traceId: ' + 'boop' + ' on profiled event');
    });

    it('calls profiler when transaction is started/stopped', async () => {
      const [client, transport] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);

      expect(startProfilingSpy).toHaveBeenCalledTimes(1);
      expect((stopProfilingSpy.mock.calls[stopProfilingSpy.mock.calls.length - 1]?.[0] as string).length).toBe(32);
    });

    it('sends profile in the same envelope as transaction', async () => {
      const [client, transport] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);

      // One for profile, the other for transaction
      expect(transportSpy).toHaveBeenCalledTimes(1);
      expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[1]?.[0]).toMatchObject({ type: 'profile' });
    });

    it('does not crash if transaction has no profile context or it is invalid', async () => {
      const [client] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      // @ts-expect-error transaction is partial
      client.emit('beforeEnvelope', createEnvelope({ type: 'transaction' }, { type: 'transaction' }));
      // @ts-expect-error transaction is partial
      client.emit('beforeEnvelope', createEnvelope({ type: 'transaction' }, { type: 'transaction', contexts: {} }));
      client.emit(
        'beforeEnvelope',
        // @ts-expect-error transaction is partial
        createEnvelope({ type: 'transaction' }, { type: 'transaction', contexts: { profile: {} } }),
      );
      client.emit(
        'beforeEnvelope',
        // @ts-expect-error transaction is partial
        createEnvelope({ type: 'transaction' }, { type: 'transaction', contexts: { profile: { profile_id: null } } }),
      );

      // Emit is sync, so we can just assert that we got here
      expect(true).toBe(true);
    });

    it('if transaction was profiled, but profiler returned null', async () => {
      const [client, transport] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      vi.spyOn(CpuProfilerBindings, 'stopProfiling').mockReturnValue(null);
      // Emit is sync, so we can just assert that we got here
      const transportSpy = vi.spyOn(transport, 'send').mockImplementation(() => {
        // Do nothing so we don't send events to Sentry
        return Promise.resolve({});
      });

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);

      // Only transaction is sent
      expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0]).toMatchObject({ type: 'transaction' });
      expect(transportSpy.mock.calls?.[0]?.[0]?.[1][1]).toBeUndefined();
    });

    it('emits preprocessEvent for profile', async () => {
      const [client] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      const onPreprocessEvent = vi.fn();

      client.on('preprocessEvent', onPreprocessEvent);

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);

      expect(onPreprocessEvent.mock.calls[1]?.[0]).toMatchObject({
        profile: {
          samples: expect.arrayContaining([expect.anything()]),
          stacks: expect.arrayContaining([expect.anything()]),
        },
      });
    });

    it('automated span instrumentation does not support continuous profiling', () => {
      const [client] = makeLegacySpanProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const integration = client.getIntegrationByName<ProfilingIntegration<Sentry.NodeClient>>('ProfilingIntegration');
      if (!integration) {
        throw new Error('Profiling integration not found');
      }

      Sentry.profiler.startProfiler();
      expect(startProfilingSpy).not.toHaveBeenCalled();
    });
  });

  it('does not crash if stop is called multiple times', async () => {
    const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

    const [client] = makeLegacySpanProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'txn' });
    transaction.end();
    transaction.end();
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
  });

  it('enriches profile with debug_id', async () => {
    GLOBAL_OBJ._sentryDebugIds = {
      'Error\n    at filename.js (filename.js:36:15)': 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
      'Error\n    at filename2.js (filename2.js:36:15)': 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
      'Error\n    at filename3.js (filename3.js:36:15)': 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
    };

    // @ts-expect-error we just mock the return type and ignore the signature
    vi.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
      return {
        samples: [
          {
            stack_id: 0,
            thread_id: '0',
            elapsed_since_start_ns: '10',
          },
          {
            stack_id: 0,
            thread_id: '0',
            elapsed_since_start_ns: '10',
          },
        ],
        measurements: {},
        resources: ['filename.js', 'filename2.js'],
        stacks: [[0]],
        frames: [],
        profiler_logging_mode: 'lazy',
      };
    });

    const [client, transport] = makeLegacySpanProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

    const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
    await wait(500);
    transaction.end();

    await Sentry.flush(1000);

    expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[1]?.[1]).toMatchObject({
      debug_meta: {
        images: [
          {
            type: 'sourcemap',
            debug_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa',
            code_file: 'filename.js',
          },
          {
            type: 'sourcemap',
            debug_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb',
            code_file: 'filename2.js',
          },
        ],
      },
    });
  });

  describe('legacy continuous profiling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // We will mock the carrier as if it has been initialized by the SDK, else everything is short circuited
      getMainCarrier().__SENTRY__ = {};
      GLOBAL_OBJ._sentryDebugIds = undefined as any;
    });
    afterEach(() => {
      const client = Sentry.getClient();
      const integration = client?.getIntegrationByName<ProfilingIntegration<Sentry.NodeClient>>('ProfilingIntegration');

      if (integration) {
        Sentry.profiler.stopProfiler();
      }

      vi.clearAllMocks();
      vi.restoreAllMocks();
      vi.runAllTimers();
      delete getMainCarrier().__SENTRY__;
    });

    it('attaches sdk metadata to chunks', () => {
      // @ts-expect-error we just mock the return type and ignore the signature
      vi.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
        return {
          samples: [
            {
              stack_id: 0,
              thread_id: '0',
              elapsed_since_start_ns: '10',
            },
            {
              stack_id: 0,
              thread_id: '0',
              elapsed_since_start_ns: '10',
            },
          ],
          measurements: {},
          stacks: [[0]],
          frames: [],
          resources: [],
          profiler_logging_mode: 'lazy',
        };
      });

      const [client, transport] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));
      Sentry.profiler.startProfiler();
      vi.advanceTimersByTime(1000);
      Sentry.profiler.stopProfiler();
      vi.advanceTimersByTime(1000);

      const profile = transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1] as ProfileChunk;
      expect(profile.client_sdk.name).toBe('sentry.javascript.node');
      expect(profile.client_sdk.version).toEqual(expect.stringMatching(/\d+\.\d+\.\d+/));
    });

    it('initializes the continuous profiler', () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
      Sentry.profiler.startProfiler();

      const integration = client.getIntegrationByName<ProfilingIntegration<Sentry.NodeClient>>('ProfilingIntegration');
      expect(integration?._profiler).toBeDefined();
    });

    it('starts a continuous profile', () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
      Sentry.profiler.startProfiler();
      expect(startProfilingSpy).toHaveBeenCalledTimes(1);
    });

    it('multiple calls to start abort previous profile', () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
      Sentry.profiler.startProfiler();
      Sentry.profiler.startProfiler();

      expect(startProfilingSpy).toHaveBeenCalledTimes(2);
      expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
    });

    it('restarts a new chunk after previous', async () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
      Sentry.profiler.startProfiler();

      vi.advanceTimersByTime(60_001);
      expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
      expect(startProfilingSpy).toHaveBeenCalledTimes(2);
    });

    it('chunks share the same profilerId', async () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
      Sentry.profiler.startProfiler();
      const profilerId = getProfilerId();

      vi.advanceTimersByTime(60_001);
      expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
      expect(startProfilingSpy).toHaveBeenCalledTimes(2);
      expect(getProfilerId()).toBe(profilerId);
    });

    it('explicit calls to stop clear profilerId', async () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
      Sentry.profiler.startProfiler();
      const profilerId = getProfilerId();
      Sentry.profiler.stopProfiler();
      Sentry.profiler.startProfiler();

      expect(getProfilerId()).toEqual(expect.any(String));
      expect(getProfilerId()).not.toBe(profilerId);
    });

    it('stops a continuous profile after interval', async () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
      Sentry.profiler.startProfiler();

      vi.advanceTimersByTime(60_001);
      expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
    });

    it('manually stopping a chunk doesnt restart the profiler', async () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
      Sentry.profiler.startProfiler();

      vi.advanceTimersByTime(1000);

      Sentry.profiler.stopProfiler();
      expect(stopProfilingSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(startProfilingSpy).toHaveBeenCalledTimes(1);
    });

    it('continuous mode does not instrument spans', () => {
      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');

      const [client] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      expect(startProfilingSpy).not.toHaveBeenCalled();
    });

    it('sends as profile_chunk envelope type', async () => {
      // @ts-expect-error we just mock the return type and ignore the signature
      vi.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
        return {
          samples: [
            {
              stack_id: 0,
              thread_id: '0',
              elapsed_since_start_ns: '10',
            },
            {
              stack_id: 0,
              thread_id: '0',
              elapsed_since_start_ns: '10',
            },
          ],
          measurements: {},
          stacks: [[0]],
          frames: [],
          resources: [],
          profiler_logging_mode: 'lazy',
        };
      });

      const [client, transport] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));
      Sentry.profiler.startProfiler();
      vi.advanceTimersByTime(1000);
      Sentry.profiler.stopProfiler();
      vi.advanceTimersByTime(1000);

      const envelopeHeaders = transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0];
      expect(envelopeHeaders?.type).toBe('profile_chunk');
      expect(envelopeHeaders?.platform).toBe('node');
    });

    it('sets global profile context', async () => {
      const [client, transport] = makeLegacyContinuousProfilingClient();
      Sentry.setCurrentClient(client);
      client.init();

      const transportSpy = vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

      const nonProfiledTransaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      nonProfiledTransaction.end();

      expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1]).not.toMatchObject({
        contexts: {
          profile: {},
        },
      });

      const integration = client.getIntegrationByName<ProfilingIntegration<Sentry.NodeClient>>('ProfilingIntegration');
      if (!integration) {
        throw new Error('Profiling integration not found');
      }

      integration._profiler.start();
      const profiledTransaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      profiledTransaction.end();
      Sentry.profiler.stopProfiler();

      expect(transportSpy.mock.calls?.[1]?.[0]?.[1]?.[0]?.[1]).toMatchObject({
        contexts: {
          trace: {
            data: expect.objectContaining({
              ['thread.id']: expect.any(String),
              ['thread.name']: expect.any(String),
            }),
          },
          profile: {
            profiler_id: expect.any(String),
          },
        },
      });
    });

    it.each([['no option is set', makeClientOptions({})]])('%s', async (_label, options) => {
      const client = new Sentry.NodeClient({
        ...options,
        dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
        tracesSampleRate: 1,
        transport: _opts =>
          Sentry.makeNodeTransport({
            url: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
            recordDroppedEvent: () => {
              return undefined;
            },
          }),
        integrations: [_nodeProfilingIntegration()],
      });

      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
      const transport = client.getTransport();

      if (!transport) {
        throw new Error('Transport not found');
      }

      vi.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));
      Sentry.profiler.startProfiler();
      const callCount = startProfilingSpy.mock.calls.length;
      expect(startProfilingSpy).toHaveBeenCalled();

      Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      expect(startProfilingSpy).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('current manual continuous profiling', () => {
    it('start and stops a profile session', () => {
      const [client] = makeCurrentSpanProfilingClient({
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

    it('calling start and stop while profile session is running does nothing', () => {
      const [client] = makeCurrentSpanProfilingClient({
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
      const [client] = makeCurrentSpanProfilingClient({
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
      const [client] = makeCurrentSpanProfilingClient({
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
        const [client, transport] = makeCurrentSpanProfilingClient({
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
    });
  });

  describe('trace profile lifecycle', () => {
    it('trace profile lifecycle ignores manual calls to start and stop', () => {
      const [client] = makeCurrentSpanProfilingClient({
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

    it('starts profiler when first span is created', () => {
      const [client] = makeCurrentSpanProfilingClient({
        profileLifecycle: 'trace',
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
      const [client] = makeCurrentSpanProfilingClient({
        profileLifecycle: 'trace',
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
      const [client] = makeCurrentSpanProfilingClient({
        profileLifecycle: 'trace',
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
      const [client] = makeCurrentSpanProfilingClient({
        profileLifecycle: 'trace',
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

    describe('envelope', () => {
      beforeEach(() => {
        vi.useRealTimers();
      });

      it('sends a profile_chunk envelope type', async () => {
        const [client, transport] = makeCurrentSpanProfilingClient({
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
});

describe('Legacy vs Current API compat', () => {
  describe('legacy', () => {
    describe('span profiling', () => {
      it('profiler.start, profiler.stop, profiler.startProfiler, profiler.stopProfiler void in automated span profiling mode', () => {
        const [client] = makeLegacySpanProfilingClient();
        Sentry.setCurrentClient(client);
        client.init();

        const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
        const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

        // Profiler calls void
        Sentry.profiler.startProfiler();
        Sentry.profiler.stopProfiler();

        expect(startProfilingSpy).not.toHaveBeenCalled();
        expect(stopProfilingSpy).not.toHaveBeenCalled();

        // Only starting and stopping the profiler is supported in legacy mode
        const span = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
        span.end();

        expect(startProfilingSpy).toHaveBeenCalled();
        expect(stopProfilingSpy).toHaveBeenCalled();
      });
    });

    describe('continuous profiling', () => {
      it('profiler.start and profiler.stop start and stop the profiler, calls to profiler.startProfiler and profiler.stopProfiler are ignored', () => {
        const [client] = makeLegacyContinuousProfilingClient();
        Sentry.setCurrentClient(client);
        client.init();

        const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
        const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

        // Creating a span will not invoke the profiler
        const span = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
        span.end();

        expect(startProfilingSpy).not.toHaveBeenCalled();
        expect(stopProfilingSpy).not.toHaveBeenCalled();

        Sentry.profiler.startProfiler();
        Sentry.profiler.stopProfiler();

        expect(startProfilingSpy).toHaveBeenCalled();
        expect(stopProfilingSpy).toHaveBeenCalled();
      });
    });
  });

  describe('current', () => {
    describe('span profiling', () => {
      it('profiler.start, profiler.stop, profiler.startProfiler, profiler.stopProfiler void in automated span profiling mode', () => {
        const [client] = makeCurrentSpanProfilingClient({
          profileLifecycle: 'trace',
        });
        Sentry.setCurrentClient(client);
        client.init();

        const startProfilingSpy = vi.spyOn(CpuProfilerBindings, 'startProfiling');
        const stopProfilingSpy = vi.spyOn(CpuProfilerBindings, 'stopProfiling');

        // Legacy mode is not supported under the new API
        Sentry.profiler.startProfiler();
        Sentry.profiler.stopProfiler();

        expect(startProfilingSpy).not.toHaveBeenCalled();
        expect(stopProfilingSpy).not.toHaveBeenCalled();

        // This API is not supported in trace mode
        Sentry.profiler.startProfiler();
        Sentry.profiler.stopProfiler();

        expect(startProfilingSpy).not.toHaveBeenCalled();
        expect(stopProfilingSpy).not.toHaveBeenCalled();
      });
    });
  });
});
