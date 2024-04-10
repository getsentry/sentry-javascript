import { EventEmitter } from 'events';

import type { Event, Hub, Transport } from '@sentry/types';
import { logger } from '@sentry/utils';

import { ProfilingIntegration } from '../src/integration';
import type { ProfiledEvent } from '../src/types';

function assertCleanProfile(event: ProfiledEvent | Event): void {
  expect(event.sdkProcessingMetadata?.profile).toBeUndefined();
}

function makeProfiledEvent(): ProfiledEvent {
  return {
    type: 'transaction',
    sdkProcessingMetadata: {
      profile: {
        profile_id: 'id',
        profiler_logging_mode: 'lazy',
        samples: [
          {
            elapsed_since_start_ns: '0',
            thread_id: '0',
            stack_id: 0,
          },
          {
            elapsed_since_start_ns: '1',
            thread_id: '0',
            stack_id: 0,
          },
        ],
        measurements: {},
        frames: [],
        stacks: [],
        resources: [],
      },
    },
  };
}

describe('ProfilingIntegration', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('has a name', () => {
    // eslint-disable-next-line deprecation/deprecation
    expect(new ProfilingIntegration().name).toBe('ProfilingIntegration');
  });

  it('stores a reference to getCurrentHub', () => {
    // eslint-disable-next-line deprecation/deprecation
    const integration = new ProfilingIntegration();

    const getCurrentHub = jest.fn().mockImplementation(() => {
      return {
        getClient: jest.fn(),
      };
    });
    const addGlobalEventProcessor = () => void 0;

    integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
    expect(integration.getCurrentHub).toBe(getCurrentHub);
  });

  describe('without hooks', () => {
    it('does not call transporter if null profile is received', () => {
      const transport: Transport = {
        send: jest.fn().mockImplementation(() => Promise.resolve()),
        flush: jest.fn().mockImplementation(() => Promise.resolve()),
      };
      // eslint-disable-next-line deprecation/deprecation
      const integration = new ProfilingIntegration();

      // eslint-disable-next-line deprecation/deprecation
      const getCurrentHub = jest.fn((): Hub => {
        return {
          getClient: () => {
            return {
              getOptions: () => {
                return {
                  _metadata: {},
                };
              },
              getDsn: () => {
                return {};
              },
              getTransport: () => transport,
            };
          },
          // eslint-disable-next-line deprecation/deprecation
        } as Hub;
      });
      const addGlobalEventProcessor = () => void 0;
      integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

      integration.handleGlobalEvent({
        type: 'transaction',
        sdkProcessingMetadata: {
          profile: null,
        },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(transport.send).not.toHaveBeenCalled();
    });

    it('when Hub.getClient returns undefined', async () => {
      const logSpy = jest.spyOn(logger, 'log');
      // eslint-disable-next-line deprecation/deprecation
      const integration = new ProfilingIntegration();

      // eslint-disable-next-line deprecation/deprecation
      const getCurrentHub = jest.fn((): Hub => {
        // eslint-disable-next-line deprecation/deprecation
        return { getClient: () => undefined } as Hub;
      });
      const addGlobalEventProcessor = () => void 0;
      integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

      assertCleanProfile(await integration.handleGlobalEvent(makeProfiledEvent()));
      expect(logSpy).toHaveBeenCalledWith(
        '[Profiling] getClient did not return a Client, removing profile from event and forwarding to next event processors.',
      );
    });
    it('when getDsn returns undefined', async () => {
      const logSpy = jest.spyOn(logger, 'log');
      // eslint-disable-next-line deprecation/deprecation
      const integration = new ProfilingIntegration();

      // eslint-disable-next-line deprecation/deprecation
      const getCurrentHub = jest.fn((): Hub => {
        return {
          getClient: () => {
            return {
              getDsn: () => undefined,
            };
          },
          // eslint-disable-next-line deprecation/deprecation
        } as Hub;
      });
      const addGlobalEventProcessor = () => void 0;
      integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

      assertCleanProfile(await integration.handleGlobalEvent(makeProfiledEvent()));
      expect(logSpy).toHaveBeenCalledWith(
        '[Profiling] getDsn did not return a Dsn, removing profile from event and forwarding to next event processors.',
      );
    });
    it('when getTransport returns undefined', async () => {
      const logSpy = jest.spyOn(logger, 'log');
      // eslint-disable-next-line deprecation/deprecation
      const integration = new ProfilingIntegration();

      // eslint-disable-next-line deprecation/deprecation
      const getCurrentHub = jest.fn((): Hub => {
        return {
          getClient: () => {
            return {
              getDsn: () => {
                return {};
              },
              getTransport: () => undefined,
            };
          },
          // eslint-disable-next-line deprecation/deprecation
        } as Hub;
      });
      const addGlobalEventProcessor = () => void 0;
      integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

      assertCleanProfile(await integration.handleGlobalEvent(makeProfiledEvent()));
      expect(logSpy).toHaveBeenCalledWith(
        '[Profiling] getTransport did not return a Transport, removing profile from event and forwarding to next event processors.',
      );
    });

    it('sends profile to sentry', async () => {
      const logSpy = jest.spyOn(logger, 'log');
      const transport: Transport = {
        send: jest.fn().mockImplementation(() => Promise.resolve()),
        flush: jest.fn().mockImplementation(() => Promise.resolve()),
      };
      // eslint-disable-next-line deprecation/deprecation
      const integration = new ProfilingIntegration();

      // eslint-disable-next-line deprecation/deprecation
      const getCurrentHub = jest.fn((): Hub => {
        return {
          getClient: () => {
            return {
              getOptions: () => {
                return {
                  _metadata: {},
                };
              },
              getDsn: () => {
                return {};
              },
              getTransport: () => transport,
            };
          },
          // eslint-disable-next-line deprecation/deprecation
        } as Hub;
      });
      const addGlobalEventProcessor = () => void 0;
      integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

      assertCleanProfile(await integration.handleGlobalEvent(makeProfiledEvent()));
      expect(logSpy.mock.calls?.[1]?.[0]).toBe('[Profiling] Preparing envelope and sending a profiling event');
    });
  });

  describe('with SDK hooks', () => {
    it('does not call transporter if null profile is received', () => {
      const transport: Transport = {
        send: jest.fn().mockImplementation(() => Promise.resolve()),
        flush: jest.fn().mockImplementation(() => Promise.resolve()),
      };
      // eslint-disable-next-line deprecation/deprecation
      const integration = new ProfilingIntegration();
      const emitter = new EventEmitter();

      // eslint-disable-next-line deprecation/deprecation
      const getCurrentHub = jest.fn((): Hub => {
        return {
          getClient: () => {
            return {
              on: emitter.on.bind(emitter),
              emit: emitter.emit.bind(emitter),
              getOptions: () => {
                return {
                  _metadata: {},
                };
              },
              getDsn: () => {
                return {};
              },
              getTransport: () => transport,
            } as any;
          },
          // eslint-disable-next-line deprecation/deprecation
        } as Hub;
      });

      const addGlobalEventProcessor = () => void 0;
      integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(transport.send).not.toHaveBeenCalled();
    });

    it('binds to startTransaction, finishTransaction and beforeEnvelope', () => {
      const transport: Transport = {
        send: jest.fn().mockImplementation(() => Promise.resolve()),
        flush: jest.fn().mockImplementation(() => Promise.resolve()),
      };
      // eslint-disable-next-line deprecation/deprecation
      const integration = new ProfilingIntegration();
      const emitter = new EventEmitter();

      // eslint-disable-next-line deprecation/deprecation
      const getCurrentHub = jest.fn((): Hub => {
        return {
          getClient: () => {
            return {
              on: emitter.on.bind(emitter),
              emit: emitter.emit.bind(emitter),
              getOptions: () => {
                return {
                  _metadata: {},
                };
              },
              getDsn: () => {
                return {};
              },
              getTransport: () => transport,
            } as any;
          },
          // eslint-disable-next-line deprecation/deprecation
        } as Hub;
      });

      const spy = jest.spyOn(emitter, 'on');

      const addGlobalEventProcessor = jest.fn();
      integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy.mock?.calls?.[0]?.[0]).toBe('startTransaction');
      expect(spy.mock?.calls?.[1]?.[0]).toBe('finishTransaction');
      expect(spy.mock?.calls?.[2]?.[0]).toBe('beforeEnvelope');

      expect(addGlobalEventProcessor).not.toHaveBeenCalled();
    });
  });
});
