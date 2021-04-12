import { init, Integrations, NodeClient, Scope } from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';
const mockedOnFatalError = jest.fn();

describe('onuncaught exceptions', () => {
  beforeEach(() => {
    mockedOnFatalError.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('send onUncaughtException, when autoSessionTracking is enabled and a release exists', () => {
    init({ dsn, release: '1.0.x', autoSessionTracking: true });

    const captureRequestSession = jest.spyOn(NodeClient.prototype, 'captureRequestSession');
    const setExtra = jest.spyOn(Scope.prototype, 'setExtra');

    const integration = new Integrations.OnUncaughtException({ onFatalError: mockedOnFatalError });

    integration.handler({ message: 'message', name: 'name' });

    // Ensure when autoSessionTracking is enabled, captureRequestSession is called
    expect(captureRequestSession).toHaveBeenCalledTimes(1);
    expect(setExtra.mock.calls[0]).toEqual(['onUncaughtException', true]);
    expect(mockedOnFatalError).toHaveBeenCalledTimes(1);
  });

  test('send onUncaughtException, when autoSessionTracking is enabled and no release exists', () => {
    init({ dsn, autoSessionTracking: true });

    const captureRequestSession = jest.spyOn(NodeClient.prototype, 'captureRequestSession');
    const setExtra = jest.spyOn(Scope.prototype, 'setExtra');

    const integration = new Integrations.OnUncaughtException({ onFatalError: mockedOnFatalError });

    integration.handler({ message: 'message', name: 'name' });

    // Ensure when autoSessionTracking is disabled, captureRequestSession is not called
    expect(captureRequestSession).toHaveBeenCalledTimes(0);
    expect(setExtra.mock.calls[0]).toEqual(['onUncaughtException', true]);
    expect(mockedOnFatalError).toHaveBeenCalledTimes(1);
  });

  test('send onUncaughtException, when autoSessionTracking is disabled', () => {
    init({ dsn, autoSessionTracking: false });

    const captureRequestSession = jest.spyOn(NodeClient.prototype, 'captureRequestSession');
    const setExtra = jest.spyOn(Scope.prototype, 'setExtra');

    const integration = new Integrations.OnUncaughtException({ onFatalError: mockedOnFatalError });

    integration.handler({ message: 'message', name: 'name' });

    // Ensure when autoSessionTracking is disabled, captureRequestSession is not called
    expect(captureRequestSession).toHaveBeenCalledTimes(0);
    expect(setExtra.mock.calls[0]).toEqual(['onUncaughtException', true]);
    expect(mockedOnFatalError).toHaveBeenCalledTimes(1);
  });
});
