/* eslint-disable simple-import-sort/sort */
import * as Sentry from '@sentry/node';

import '@sentry/tracing'; // this has a addExtensionMethods side effect
import { ProfilingIntegration } from './index'; // this has a addExtensionMethods side effect

import { importCppBindingsModule } from './cpu_profiler';

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  debug: false,
  tracesSampleRate: 1,
  profilesSampleRate: 1,
  integrations: [new ProfilingIntegration()],
});

const profiler = importCppBindingsModule();

describe('hubextensions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('calls profiler when startTransaction is invoked on hub', async () => {
    const startProfilingSpy = jest.spyOn(profiler, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(profiler, 'stopProfiling');
    const transport = Sentry.getCurrentHub().getClient()?.getTransport();

    if (!transport) {
      throw new Error('Sentry getCurrentHub()->getClient()->getTransport() did not return a transport');
    }

    const transportSpy = jest.spyOn(transport, 'send').mockImplementation(() => {
      // Do nothing so we don't send events to Sentry
      return Promise.resolve();
    });

    const transaction = Sentry.getCurrentHub().startTransaction({ name: 'profile_hub' });
    transaction.finish();

    await Sentry.flush(1000);

    expect(startProfilingSpy).toHaveBeenCalledTimes(1);
    expect((stopProfilingSpy.mock.calls?.[0][0] as unknown as string).startsWith('profile_hub')).toBe(true);
    // One for profile, the other for transaction
    expect(transportSpy).toHaveBeenCalledTimes(2);
    expect(transportSpy.mock.calls?.[0]?.[0]?.[1]?.[0]?.[0]).toMatchObject({ type: 'profile' });
  });

  it('respect max profile duration timeout', async () => {
    jest.useFakeTimers();
    const startProfilingSpy = jest.spyOn(profiler, 'startProfiling');
    const stopProfilingSpy = jest.spyOn(profiler, 'stopProfiling');
    const transport = Sentry.getCurrentHub().getClient()?.getTransport();

    if (!transport) {
      throw new Error('Sentry getCurrentHub()->getClient()->getTransport() did not return a transport');
    }

    const transaction = Sentry.getCurrentHub().startTransaction({ name: 'timeout_transaction' });
    expect(startProfilingSpy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30001);

    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
    expect((stopProfilingSpy.mock.calls?.[0][0] as unknown as string).startsWith('timeout_transaction')).toBe(true);

    transaction.finish();
    expect(stopProfilingSpy).toHaveBeenCalledTimes(1);
  });
});
