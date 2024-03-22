import { EventEmitter } from 'events';

import type { Transport } from '@sentry/types';

import type { NodeClient } from '@sentry/node';
import { _nodeProfilingIntegration } from '../src/integration';

describe('ProfilingIntegration', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('has a name', () => {
    expect(_nodeProfilingIntegration().name).toBe('ProfilingIntegration');
  });

  it('does not call transporter if null profile is received', () => {
    const transport: Transport = {
      send: jest.fn().mockImplementation(() => Promise.resolve()),
      flush: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    const integration = _nodeProfilingIntegration();
    const emitter = new EventEmitter();

    const client = {
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
    } as unknown as NodeClient;

    integration.setup(client);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('binds to spanStart, spanEnd and beforeEnvelope', () => {
    const transport: Transport = {
      send: jest.fn().mockImplementation(() => Promise.resolve()),
      flush: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    const integration = _nodeProfilingIntegration();

    const client = {
      on: jest.fn(),
      emit: jest.fn(),
      getOptions: () => {
        return {
          _metadata: {},
        };
      },
      getDsn: () => {
        return {};
      },
      getTransport: () => transport,
    } as unknown as NodeClient;

    const spy = jest.spyOn(client, 'on');

    integration.setup(client);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenCalledWith('spanStart', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('spanEnd', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('beforeEnvelope', expect.any(Function));
  });
});
