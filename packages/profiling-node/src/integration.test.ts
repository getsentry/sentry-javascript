import type { Event, Hub, Transport } from '@sentry/types';
import { logger } from '@sentry/utils';

import { ProfilingIntegration } from './integration';
import type { ProfiledEvent } from './utils';

function assertCleanProfile(event: ProfiledEvent | Event): void {
  expect(event.sdkProcessingMetadata?.profile).toBeUndefined();
}

function makeProfiledEvent(): ProfiledEvent {
  return {
    type: 'transaction',
    sdkProcessingMetadata: {
      profile: {
        profiler_logging_mode: 'lazy',
        profile_relative_ended_at_ns: 1,
        profile_relative_started_at_ns: 0,
        samples: [],
        frames: [],
        stacks: [],
      },
    },
  };
}

describe('ProfilingIntegration', () => {
  it('has a name', () => {
    expect(new ProfilingIntegration().name).toBe('ProfilingIntegration');
  });

  it('keeps a reference to getCurrentHub', () => {
    const integration = new ProfilingIntegration();

    const getCurrentHub = jest.fn();
    const addGlobalEventProcessor = () => void 0;

    integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
    expect(integration.getCurrentHub).toBe(getCurrentHub);
  });

  it('when Hub.getClient returns undefined', () => {
    const logSpy = jest.spyOn(logger, 'log');
    const integration = new ProfilingIntegration();

    const getCurrentHub = jest.fn((): Hub => {
      return { getClient: () => undefined } as Hub;
    });
    const addGlobalEventProcessor = () => void 0;
    integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

    assertCleanProfile(integration.handleGlobalEvent(makeProfiledEvent()));
    expect(logSpy).toHaveBeenCalledWith(
      '[Profiling] getClient did not return a Client, removing profile from event and forwarding to next event processors.',
    );
  });
  it('when getDsn returns undefined', () => {
    const logSpy = jest.spyOn(logger, 'log');
    const integration = new ProfilingIntegration();

    const getCurrentHub = jest.fn((): Hub => {
      return {
        getClient: () => {
          return {
            getDsn: () => undefined,
          };
        },
      } as Hub;
    });
    const addGlobalEventProcessor = () => void 0;
    integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

    assertCleanProfile(integration.handleGlobalEvent(makeProfiledEvent()));
    expect(logSpy).toHaveBeenCalledWith(
      '[Profiling] getDsn did not return a Dsn, removing profile from event and forwarding to next event processors.',
    );
  });
  it('when getTransport returns undefined', () => {
    const logSpy = jest.spyOn(logger, 'log');
    const integration = new ProfilingIntegration();

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
      } as Hub;
    });
    const addGlobalEventProcessor = () => void 0;
    integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

    assertCleanProfile(integration.handleGlobalEvent(makeProfiledEvent()));
    expect(logSpy).toHaveBeenCalledWith(
      '[Profiling] getTransport did not return a Transport, removing profile from event and forwarding to next event processors.',
    );
  });

  it('sends profile to sentry', () => {
    const logSpy = jest.spyOn(logger, 'log');
    const transport: Transport = {
      send: jest.fn().mockImplementation(() => Promise.resolve()),
      flush: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    const integration = new ProfilingIntegration();

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
      } as Hub;
    });
    const addGlobalEventProcessor = () => void 0;
    integration.setupOnce(addGlobalEventProcessor, getCurrentHub);

    assertCleanProfile(integration.handleGlobalEvent(makeProfiledEvent()));
    expect(logSpy).toHaveBeenCalledWith('[Profiling] Preparing envelope and sending a profiling event.');
  });
});
