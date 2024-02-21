import { getCurrentHub, setCurrentClient } from '@sentry/core';
import { addTracingExtensions } from '../../src/custom/hubextensions';
import { TestClient, getDefaultTestClientOptions } from '../helpers/TestClient';

describe('hubextensions', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('startTransaction is noop', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();
    addTracingExtensions();

    const mockConsole = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // eslint-disable-next-line deprecation/deprecation
    const transaction = getCurrentHub().startTransaction({ name: 'test' });
    expect(transaction).toEqual({});

    expect(mockConsole).toHaveBeenCalledTimes(1);
    expect(mockConsole).toHaveBeenCalledWith(
      'startTransaction is a noop in @sentry/opentelemetry. Use `startSpan` instead.',
    );
  });
});
