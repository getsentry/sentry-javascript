import { GLOBAL_OBJ } from '@sentry/utils';

import { captureEvent, getCurrentScope } from '../../src';
import { initAndBind } from '../../src/sdk';
import { TestClient, getDefaultTestClientOptions } from '../mocks/client';
import { AddAttachmentTestIntegration } from '../mocks/integration';

const PUBLIC_DSN = 'https://username@domain/123';
const sendEvent = jest.spyOn(TestClient.prototype, 'sendEvent');

describe('Hint', () => {
  beforeEach(() => {
    TestClient.sendEventCalled = undefined;
    TestClient.instance = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error for testing
    delete GLOBAL_OBJ.__SENTRY__;
  });

  describe('attachments', () => {
    test('can be mutated in `beforeSend`', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        beforeSend: (event, hint) => {
          hint.attachments = [...(hint.attachments || []), { filename: 'another.file', data: 'more text' }];
          return event;
        },
      });

      const client = new TestClient(options);
      client.captureEvent({});

      const [, hint] = sendEvent.mock.calls[0];
      expect(hint).toEqual({ attachments: [{ filename: 'another.file', data: 'more text' }] });
    });

    test('gets passed through to `beforeSend` and can be further mutated', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        beforeSend: (event, hint) => {
          hint.attachments = [...(hint.attachments || []), { filename: 'another.file', data: 'more text' }];
          return event;
        },
      });

      const client = new TestClient(options);
      client.captureEvent({}, { attachments: [{ filename: 'some-file.txt', data: 'Hello' }] });

      const [, hint] = sendEvent.mock.calls[0];
      expect(hint).toEqual({
        attachments: [
          { filename: 'some-file.txt', data: 'Hello' },
          { filename: 'another.file', data: 'more text' },
        ],
      });
    });

    test('gets passed through to `beforeSendTransaction` and can be further mutated', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        beforeSendTransaction: (event, hint) => {
          hint.attachments = [...(hint.attachments || []), { filename: 'another.file', data: 'more text' }];
          return event;
        },
      });

      const client = new TestClient(options);
      client.captureEvent(
        { transaction: '/dogs/are/great', type: 'transaction' },
        { attachments: [{ filename: 'some-file.txt', data: 'Hello' }] },
      );

      const [, hint] = sendEvent.mock.calls[0];
      expect(hint).toEqual({
        attachments: [
          { filename: 'some-file.txt', data: 'Hello' },
          { filename: 'another.file', data: 'more text' },
        ],
      });
    });

    test('can be mutated by an integration via event processor', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({
        dsn: PUBLIC_DSN,
        integrations: [new AddAttachmentTestIntegration()],
      });

      initAndBind(TestClient, options);
      captureEvent({});

      const [, hint] = sendEvent.mock.calls[0];
      expect(hint?.attachments).toEqual([{ filename: 'integration.file', data: 'great content!' }]);
    });

    test('gets copied from scope to hint', () => {
      expect.assertions(1);

      const options = getDefaultTestClientOptions({ dsn: PUBLIC_DSN });
      initAndBind(TestClient, options);

      getCurrentScope().addAttachment({ filename: 'scope.file', data: 'great content!' });

      captureEvent({}, { attachments: [{ filename: 'some-file.txt', data: 'Hello' }] });

      const [, hint] = sendEvent.mock.calls[0];
      expect(hint?.attachments).toEqual([
        { filename: 'some-file.txt', data: 'Hello' },
        { filename: 'scope.file', data: 'great content!' },
      ]);
    });
  });
});
