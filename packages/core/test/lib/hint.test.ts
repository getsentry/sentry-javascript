import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { AddAttachmentTestIntegration } from '../mocks/integration';
import { initAndBind } from '../../src/sdk';
import { captureEvent } from '@sentry/hub';

const PUBLIC_DSN = 'https://username@domain/123';
const sendEvent = jest.spyOn(TestClient.prototype, 'sendEvent');

describe('Hint', () => {
  beforeEach(() => {
    TestClient.sendEventCalled = undefined;
    TestClient.instance = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('can be mutated in beforeSend', () => {
    expect.assertions(1);

    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      beforeSend: (event, hint) => {
        if (hint) {
          hint.attachments = [...(hint?.attachments || []), { filename: 'another.file', data: 'more text' }];
        }

        return event;
      },
    });

    const client = new TestClient(options);
    client.captureEvent({});

    const [, hint] = sendEvent.mock.calls[0];

    expect(hint).toEqual({
      attachments: [{ filename: 'another.file', data: 'more text' }],
    });
  });

  test('gets passed through to beforeSend and can be further mutated', () => {
    expect.assertions(1);

    const options = getDefaultTestClientOptions({
      dsn: PUBLIC_DSN,
      beforeSend: (event, hint) => {
        if (hint) {
          hint.attachments = [...(hint?.attachments || []), { filename: 'another.file', data: 'more text' }];
        }

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
});
