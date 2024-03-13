import * as Sentry from '@sentry/node-experimental';

import { getMainCarrier } from '@sentry/core';
import type { Transport } from '@sentry/types';
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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('spanProfileUtils', () => {
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

    expect((transport.send as any).mock.calls[0][0][1][0][0].type).toBe('transaction');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('logger warns user if traceId is invalid', async () => {
    const logSpy = jest.spyOn(logger, 'log');

    const [client, transport] = makeClientWithHooks();
    Sentry.setCurrentClient(client);
    client.init();

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
