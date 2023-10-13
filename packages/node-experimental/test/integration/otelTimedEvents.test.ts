import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

import type { NodeExperimentalClient } from '../../src/sdk/client';
import { getCurrentHub } from '../../src/sdk/hub';
import { startSpan } from '../../src/sdk/trace';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

describe('Integration | OTEL TimedEvents', () => {
  afterEach(() => {
    cleanupOtel();
  });

  it('captures TimedEvents with name `exception` as exceptions', async () => {
    const beforeSend = jest.fn(() => null);
    const beforeSendTransaction = jest.fn(() => null);

    mockSdkInit({ beforeSend, beforeSendTransaction, enableTracing: true });

    const hub = getCurrentHub();
    const client = hub.getClient() as NodeExperimentalClient;

    startSpan({ name: 'test' }, span => {
      span?.addEvent('exception', {
        [SemanticAttributes.EXCEPTION_MESSAGE]: 'test-message',
        'test-span-event-attr': 'test-span-event-attr-value',
      });

      span?.addEvent('other', {
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
              mechanism: { handled: true, type: 'generic' },
              stacktrace: expect.any(Object),
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
