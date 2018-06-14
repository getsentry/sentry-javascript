import { init, Integrations } from '../src';
// import { Hub } from '../src/hub';

// Hub.getGlobal = jest.fn(jest.fn);
// jest.mock('../src/hub');

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('integrations', () => {
  // test('unhandled promise listener installed', () => {
  //   init({ dsn });
  //   expect(process.listeners('unhandledRejection')).toHaveLength(1);
  // });

  test('sendUnhandledPromise', () => {
    init({ dsn });
    const int = new Integrations.OnUnhandledRejection();
    const promise = {
      domain: {
        sentryContext: {
          extra: { tag: '1' },
          tags: { extra: 1 },
          user: { id: 1 },
        },
      },
    };
    // const mockSoundPlayerInstance = Hub.mock.instances[0];
    // console.log(Hub);
    // console.log(mockSoundPlayerInstance);
    int.sendUnhandledPromise(new Error('bla'), promise);

    // console.log(global.__SENTRY__.hub.stack[0]);
  });
});
