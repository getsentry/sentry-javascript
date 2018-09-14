import { captureMessage, configureScope, init, Integrations, SentryEvent } from '../../src';

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

describe('Modules Integration', () => {
  test('modules are added to an event', done => {
    init({ dsn, integrations: () => [new Integrations.Modules()] });
    configureScope(scope => {
      scope.addEventProcessor(async (event: SentryEvent) => {
        expect(event).toHaveProperty('modules');
        done();
        return null;
      });
    });
    captureMessage('test');
  });
});
