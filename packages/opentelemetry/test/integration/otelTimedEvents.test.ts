import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

import { getCurrentHub } from '../../src/custom/hub';
import { startSpan } from '../../src/trace';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';
import type { TestClientInterface } from '../helpers/TestClient';

describe('Integration | OTEL TimedEvents', () => {
  afterEach(() => {
    cleanupOtel();
  });

  it('captures TimedEvents with name `exception` as exceptions', async () => {
    const beforeSend = jest.fn(() => null);
    const beforeSendTransaction = jest.fn(() => null);

    mockSdkInit({ beforeSend, beforeSendTransaction, enableTracing: true });

    const hub = getCurrentHub();
    const client = hub.getClient() as TestClientInterface;

    startSpan({ name: 'test' }, span => {
      span.addEvent('exception', {
        [SemanticAttributes.EXCEPTION_MESSAGE]: 'test-message',
        'test-span-event-attr': 'test-span-event-attr-value',
      });

      span.addEvent('other', {
        [SemanticAttributes.EXCEPTION_MESSAGE]: 'test-message-2',
        'test-span-event-attr': 'test-span-event-attr-value',
      });
    });

    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'test-message',
            },
          ],
        },
      }),
      {
        event_id: expect.any(String),
        originalException: expect.any(Error),
        syntheticException: expect.any(Error),
      },
    );
  });
});
