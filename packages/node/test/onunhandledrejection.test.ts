import { Hub, init, Integrations, Scope } from '../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('unhandled promises', () => {
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
});
