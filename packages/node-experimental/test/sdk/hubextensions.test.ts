import { NodeExperimentalClient } from '../../src/sdk/client';
import { getCurrentHub } from '../../src/sdk/hub';
import { addTracingExtensions } from '../../src/sdk/hubextensions';
import { getDefaultNodeExperimentalClientOptions } from '../helpers/getDefaultNodePreviewClientOptions';

describe('hubextensions', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('startTransaction is noop', () => {
    const client = new NodeExperimentalClient(getDefaultNodeExperimentalClientOptions());
    getCurrentHub().bindClient(client);
    addTracingExtensions();

    const mockConsole = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const transaction = getCurrentHub().startTransaction({ name: 'test' });
    expect(transaction).toEqual({});

    expect(mockConsole).toHaveBeenCalledTimes(1);
    expect(mockConsole).toHaveBeenCalledWith(
      'startTransaction is a noop in @sentry/node-experimental. Use `startSpan` instead.',
    );
  });
});
