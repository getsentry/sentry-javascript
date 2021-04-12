import { Hub, init, Integrations, NodeClient, Scope, getCurrentHub } from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('unhandled promises', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('install global listener', () => {
    init({ dsn });
    expect(process.listeners('unhandledRejection')).toHaveLength(1);
  });

  test('sendUnhandledPromise', () => {
    const integration = new Integrations.OnUnhandledRejection();
    const promise = {
      domain: {
        sentryContext: {
          extra: { extra: '1' },
          tags: { tag: '2' },
          user: { id: 1 },
        },
      },
    };

    const captureException = jest.spyOn(Hub.prototype, 'captureException');
    const setUser = jest.spyOn(Scope.prototype, 'setUser');
    const setExtra = jest.spyOn(Scope.prototype, 'setExtra');
    const setExtras = jest.spyOn(Scope.prototype, 'setExtras');
    const setTags = jest.spyOn(Scope.prototype, 'setTags');

    integration.sendUnhandledPromise('bla', promise);

    expect(captureException.mock.calls[0][0]).toBe('bla');
    expect(setUser.mock.calls[0][0]).toEqual({ id: 1 });
    expect(setExtra.mock.calls[0]).toEqual(['unhandledPromiseRejection', true]);

    expect(setExtras.mock.calls[0]).toEqual([{ extra: '1' }]);
    expect(setTags.mock.calls[0]).toEqual([{ tag: '2' }]);
  });

  test('when release exists, and autoSessionTracking is enabled, captureRequestSession should be called', () => {
    init({ dsn, release: '1.0.x', autoSessionTracking: true });
    const integration = new Integrations.OnUnhandledRejection();

    const captureException = jest.spyOn(Hub.prototype, 'captureException');
    const captureRequestSession = jest.spyOn(NodeClient.prototype, 'captureRequestSession');
    const setExtra = jest.spyOn(Scope.prototype, 'setExtra');

    integration.sendUnhandledPromise('bla', {});

    expect(captureException.mock.calls[0][0]).toBe('bla');
    // Ensure when autoSessionTracking is enabled, captureRequestSession is called
    expect(captureRequestSession).toHaveBeenCalledTimes(1);
    expect(setExtra.mock.calls[0]).toEqual(['unhandledPromiseRejection', true]);

    void getCurrentHub()
      .getClient<NodeClient>()
      ?.close();
  });

  test('when no release exists and autoSessionTracking is enabled, captureRequestSession should not be called', () => {
    init({ dsn, autoSessionTracking: true });
    const integration = new Integrations.OnUnhandledRejection();

    const captureRequestSession = jest.spyOn(NodeClient.prototype, 'captureRequestSession');
    integration.sendUnhandledPromise('bla', {});
    expect(captureRequestSession).toHaveBeenCalledTimes(0);
  });

  test('when autoSessionTracking is disabled, captureRequestSession should not be called', () => {
    init({ dsn, autoSessionTracking: false });
    const integration = new Integrations.OnUnhandledRejection();

    const captureRequestSession = jest.spyOn(NodeClient.prototype, 'captureRequestSession');
    integration.sendUnhandledPromise('bla', {});
    expect(captureRequestSession).toHaveBeenCalledTimes(0);
  });
});
