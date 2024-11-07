import * as Sentry from '@sentry/node';

import { getMainCarrier } from '@sentry/core';
import type { NodeClientOptions } from '@sentry/node/build/types/types';
import type { ProfilingIntegration } from '@sentry/types';
import type { ProfileChunk, Transport } from '@sentry/types';
import { GLOBAL_OBJ, createEnvelope, logger } from '@sentry/utils';
import { CpuProfilerBindings } from '../src/cpu_profiler';
import { _nodeProfilingIntegration } from '../src/integration';

function makeClientWithHooks(): [Sentry.NodeClient, Transport] {
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

function makeContinuousProfilingClient(): [Sentry.NodeClient, Transport] {
  const integration = _nodeProfilingIntegration();
  const client = new Sentry.NodeClient({
    stackParser: Sentry.defaultStackParser,
    tracesSampleRate: 1,
    profilesSampleRate: undefined,
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

describe('automated span instrumentation', () => {
  beforeEach(() => {
    jest.useRealTimers();
    // We will mock the carrier as if it has been initialized by the SDK, else everything is short circuited
    getMainCarrier().__SENTRY__ = {};
    GLOBAL_OBJ._sentryDebugIds = undefined as any;
  });
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete getMainCarrier().__SENTRY__;
  });

  it('pulls environment from sdk init', async () => {
    const [client, transport] = makeClientWithHooks();
    Sentry.setCurrentClient(client);
    client.init();

    const transportSpy = jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

    const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
    await wait(500);
    transaction.end();

    await Sentry.flush(1000);
    expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1]).toMatchObject({ environment: 'test-environment' });
  });

  it('logger warns user if there are insufficient samples and discards the profile', async () => {
    const logSpy = jest.spyOn(logger, 'log');

    const [client, transport] = makeClientWithHooks();
    Sentry.setCurrentClient(client);
    client.init();

    // @ts-expect-error we just mock the return type and ignore the signature
    jest.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
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

    jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

    const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
    transaction.end();

    await Sentry.flush(1000);

    expect(logSpy).toHaveBeenCalledWith('[Profiling] Discarding profile because it contains less than 2 samples');

    expect((transport.send as any).mock.calls[0][0][1][0][0]?.type).toBe('transaction');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('logger warns user if traceId is invalid', async () => {
    const logSpy = jest.spyOn(logger, 'log');

    const [client, transport] = makeClientWithHooks();
    Sentry.setCurrentClient(client);
    client.init();

    // @ts-expect-error we just mock the return type and ignore the signature
    jest.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
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

    jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

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

  describe('with hooks', () => {
    it('calls profiler when transaction is started/stopped', async () => {
      const [client, transport] = makeClientWithHooks();
      Sentry.setCurrentClient(client);
      client.init();

      const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
      const stopProfilingSpy = jest.spyOn(CpuProfilerBindings, 'stopProfiling');

      jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);

      expect(startProfilingSpy).toHaveBeenCalledTimes(1);
      expect((stopProfilingSpy.mock.calls[stopProfilingSpy.mock.calls.length - 1]?.[0] as string).length).toBe(32);
    });

    it('sends profile in the same envelope as transaction', async () => {
      const [client, transport] = makeClientWithHooks();
      Sentry.setCurrentClient(client);
      client.init();

      const transportSpy = jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);

      // One for profile, the other for transaction
      expect(transportSpy).toHaveBeenCalledTimes(1);
      expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[1]?.[0]).toMatchObject({ type: 'profile' });
    });

    it('does not crash if transaction has no profile context or it is invalid', async () => {
      const [client] = makeClientWithHooks();
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
      const [client, transport] = makeClientWithHooks();
      Sentry.setCurrentClient(client);
      client.init();

      jest.spyOn(CpuProfilerBindings, 'stopProfiling').mockReturnValue(null);
      // Emit is sync, so we can just assert that we got here
      const transportSpy = jest.spyOn(transport, 'send').mockImplementation(() => {
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
      const [client] = makeClientWithHooks();
      Sentry.setCurrentClient(client);
      client.init();

      const onPreprocessEvent = jest.fn();

      client.on('preprocessEvent', onPreprocessEvent);

      const transaction = Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
      await wait(500);
      transaction.end();

      await Sentry.flush(1000);

      expect(onPreprocessEvent.mock.calls[1][0]).toMatchObject({
        profile: {
          samples: expect.arrayContaining([expect.anything()]),
          stacks: expect.arrayContaining([expect.anything()]),
        },
      });
    });

    it('automated span instrumentation does not support continuous profiling', () => {
      const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');

      const [client] = makeClientWithHooks();
      Sentry.setCurrentClient(client);
      client.init();

      const integration = client.getIntegrationByName<ProfilingIntegration<Sentry.NodeClient>>('ProfilingIntegration');
      if (!integration) {
        throw new Error('Profiling integration not found');
      }
      integration._profiler.start();
      expect(startProfilingSpy).not.toHaveBeenCalled();
    });
  });

  it('does not crash if stop is called multiple times', async () => {
    const stopProfilingSpy = jest.spyOn(CpuProfilerBindings, 'stopProfiling');

    const [client] = makeClientWithHooks();
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
    jest.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
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

    const [client, transport] = makeClientWithHooks();
    Sentry.setCurrentClient(client);
    client.init();

    const transportSpy = jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

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
});

describe('continuous profiling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
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

    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.runAllTimers();
    delete getMainCarrier().__SENTRY__;
  });

  it('attaches sdk metadata to chunks', () => {
    // @ts-expect-error we just mock the return type and ignore the signature
    jest.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
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

    const [client, transport] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    const transportSpy = jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));
    Sentry.profiler.startProfiler();
    jest.advanceTimersByTime(1000);
    Sentry.profiler.stopProfiler();
    jest.advanceTimersByTime(1000);

    const profile = transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[1] as ProfileChunk;
    expect(profile.client_sdk.name).toBe('sentry.javascript.node');
    expect(profile.client_sdk.version).toEqual(expect.stringMatching(/\d+\.\d+\.\d+/));
  });

  it('initializes the continuous profiler', () => {
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');

    const [client] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
    Sentry.profiler.startProfiler();

    const integration = client.getIntegrationByName<ProfilingIntegration<Sentry.NodeClient>>('ProfilingIntegration');
    expect(integration?._profiler).toBeDefined();
  });

  it('starts a continuous profile', () => {
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');

    const [client] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
    Sentry.profiler.startProfiler();
    expect(startProfilingSpy).toHaveBeenCalledTimes(1);
  });

  it('multiple calls to start abort previous profile', () => {
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(CpuProfilerBindings, 'stopProfiling');

    const [client] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
    Sentry.profiler.startProfiler();
    Sentry.profiler.startProfiler();

    expect(startProfilingSpy).toHaveBeenCalledTimes(2);
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
  });

  it('restarts a new chunk after previous', async () => {
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(CpuProfilerBindings, 'stopProfiling');

    const [client] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
    Sentry.profiler.startProfiler();

    jest.advanceTimersByTime(5001);
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
    expect(startProfilingSpy).toHaveBeenCalledTimes(2);
  });

  it('chunks share the same profilerId', async () => {
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(CpuProfilerBindings, 'stopProfiling');

    const [client] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
    Sentry.profiler.startProfiler();
    const profilerId = getProfilerId();

    jest.advanceTimersByTime(5001);
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
    expect(startProfilingSpy).toHaveBeenCalledTimes(2);
    expect(getProfilerId()).toBe(profilerId);
  });

  it('explicit calls to stop clear profilerId', async () => {
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');

    const [client] = makeContinuousProfilingClient();
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
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(CpuProfilerBindings, 'stopProfiling');

    const [client] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
    Sentry.profiler.startProfiler();

    jest.advanceTimersByTime(5001);
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
  });

  it('manually stopping a chunk doesnt restart the profiler', async () => {
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(CpuProfilerBindings, 'stopProfiling');

    const [client] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    expect(startProfilingSpy).not.toHaveBeenCalledTimes(1);
    Sentry.profiler.startProfiler();

    jest.advanceTimersByTime(1000);

    Sentry.profiler.stopProfiler();
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    expect(startProfilingSpy).toHaveBeenCalledTimes(1);
  });

  it('continuous mode does not instrument spans', () => {
    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');

    const [client] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
    expect(startProfilingSpy).not.toHaveBeenCalled();
  });

  it('sends as profile_chunk envelope type', async () => {
    // @ts-expect-error we just mock the return type and ignore the signature
    jest.spyOn(CpuProfilerBindings, 'stopProfiling').mockImplementation(() => {
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

    const [client, transport] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    const transportSpy = jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));
    Sentry.profiler.startProfiler();
    jest.advanceTimersByTime(1000);
    Sentry.profiler.stopProfiler();
    jest.advanceTimersByTime(1000);

    expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0]?.type).toBe('profile_chunk');
  });

  it('sets global profile context', async () => {
    const [client, transport] = makeContinuousProfilingClient();
    Sentry.setCurrentClient(client);
    client.init();

    const transportSpy = jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));

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
});

describe('continuous profiling does not start in span profiling mode', () => {
  it.each([
    ['profilesSampleRate=1', makeClientOptions({ profilesSampleRate: 1 })],
    ['profilesSampler is defined', makeClientOptions({ profilesSampler: () => 1 })],
  ])('%s', async (_label, options) => {
    const logSpy = jest.spyOn(logger, 'log');
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

    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
    const transport = client.getTransport();

    if (!transport) {
      throw new Error('Transport not found');
    }

    jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));
    Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });

    expect(startProfilingSpy).toHaveBeenCalled();
    const integration = client.getIntegrationByName<ProfilingIntegration<Sentry.NodeClient>>('ProfilingIntegration');

    if (!integration) {
      throw new Error('Profiling integration not found');
    }

    integration._profiler.start();
    expect(logSpy).toHaveBeenLastCalledWith(
      '[Profiling] Failed to start, sentry client was never attached to the profiler.',
    );
  });
});
describe('continuous profiling mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['profilesSampleRate=0', makeClientOptions({ profilesSampleRate: 0 })],
    ['profilesSampleRate=undefined', makeClientOptions({ profilesSampleRate: undefined })],
    // @ts-expect-error test invalid value
    ['profilesSampleRate=null', makeClientOptions({ profilesSampleRate: null })],
    [
      'profilesSampler is not defined and profilesSampleRate is not set',
      makeClientOptions({ profilesSampler: undefined, profilesSampleRate: 0 }),
    ],
  ])('%s', async (_label, options) => {
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

    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
    const transport = client.getTransport();

    if (!transport) {
      throw new Error('Transport not found');
    }

    jest.spyOn(transport, 'send').mockReturnValue(Promise.resolve({}));
    Sentry.profiler.startProfiler();
    const callCount = startProfilingSpy.mock.calls.length;
    expect(startProfilingSpy).toHaveBeenCalled();

    Sentry.startInactiveSpan({ forceTransaction: true, name: 'profile_hub' });
    expect(startProfilingSpy).toHaveBeenCalledTimes(callCount);
  });

  it('top level methods proxy to integration', () => {
    const client = new Sentry.NodeClient({
      ...makeClientOptions({ profilesSampleRate: undefined }),
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

    const startProfilingSpy = jest.spyOn(CpuProfilerBindings, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(CpuProfilerBindings, 'stopProfiling');

    Sentry.profiler.startProfiler();
    expect(startProfilingSpy).toHaveBeenCalledTimes(1);
    Sentry.profiler.stopProfiler();
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
  });
});
