import { getCurrentHub } from '../../src/custom/hub';
import { addTracingExtensions } from '../../src/custom/hubextensions';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('hubextensions', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('startTransaction is noop', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    getCurrentHub().bindClient(client);
    addTracingExtensions();

    const mockConsole = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const transaction = getCurrentHub().startTransaction({ name: 'test' });
    expect(transaction).toEqual({});

    expect(mockConsole).toHaveBeenCalledTimes(1);
    expect(mockConsole).toHaveBeenCalledWith(
      'startTransaction is a noop in @sentry/opentelemetry. Use `startSpan` instead.',
    );
  });
});
