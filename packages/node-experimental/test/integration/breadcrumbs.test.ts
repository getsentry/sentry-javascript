import { withScope } from '@sentry/core';
import { getCurrentHub, startSpan } from '@sentry/opentelemetry';

import type { NodeExperimentalClient } from '../../src/types';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

describe('Integration | breadcrumbs', () => {
  const beforeSendTransaction = jest.fn(() => null);

  afterEach(() => {
    cleanupOtel();
  });

  describe('without tracing', () => {
    it('correctly adds & retrieves breadcrumbs', async () => {
      const beforeSend = jest.fn(() => null);
      const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);

      mockSdkInit({ beforeSend, beforeBreadcrumb });

      const hub = getCurrentHub();
      const client = hub.getClient() as NodeExperimentalClient;

      hub.addBreadcrumb({ timestamp: 123456, message: 'test1' });
      hub.addBreadcrumb({ timestamp: 123457, message: 'test2', data: { nested: 'yes' } });
      hub.addBreadcrumb({ timestamp: 123455, message: 'test3' });

      const error = new Error('test');
      hub.captureException(error);

      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeBreadcrumb).toHaveBeenCalledTimes(3);

      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          breadcrumbs: [
            { message: 'test1', timestamp: 123456 },
            { data: { nested: 'yes' }, message: 'test2', timestamp: 123457 },
            { message: 'test3', timestamp: 123455 },
          ],
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });

    it('handles parallel scopes', async () => {
      const beforeSend = jest.fn(() => null);
      const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);

      mockSdkInit({ beforeSend, beforeBreadcrumb });

      const hub = getCurrentHub();
      const client = hub.getClient() as NodeExperimentalClient;

      const error = new Error('test');

      hub.addBreadcrumb({ timestamp: 123456, message: 'test0' });

      withScope(() => {
        hub.addBreadcrumb({ timestamp: 123456, message: 'test1' });
      });

      withScope(() => {
        hub.addBreadcrumb({ timestamp: 123456, message: 'test2' });
        hub.captureException(error);
      });

      withScope(() => {
        hub.addBreadcrumb({ timestamp: 123456, message: 'test3' });
      });

      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeBreadcrumb).toHaveBeenCalledTimes(4);

      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          breadcrumbs: [
            { message: 'test0', timestamp: 123456 },
            { message: 'test2', timestamp: 123456 },
          ],
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );
    });
  });

  it('correctly adds & retrieves breadcrumbs', async () => {
    const beforeSend = jest.fn(() => null);
    const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);

    mockSdkInit({ beforeSend, beforeBreadcrumb, beforeSendTransaction, enableTracing: true });

    const hub = getCurrentHub();
    const client = hub.getClient() as NodeExperimentalClient;

    const error = new Error('test');

    startSpan({ name: 'test' }, () => {
      hub.addBreadcrumb({ timestamp: 123456, message: 'test1' });

      startSpan({ name: 'inner1' }, () => {
        hub.addBreadcrumb({ timestamp: 123457, message: 'test2', data: { nested: 'yes' } });
      });

      startSpan({ name: 'inner2' }, () => {
        hub.addBreadcrumb({ timestamp: 123455, message: 'test3' });
      });

      hub.captureException(error);
    });

    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeBreadcrumb).toHaveBeenCalledTimes(3);

    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        breadcrumbs: [
          { message: 'test1', timestamp: 123456 },
          { data: { nested: 'yes' }, message: 'test2', timestamp: 123457 },
          { message: 'test3', timestamp: 123455 },
        ],
      }),
      {
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      },
    );
  });

  it('correctly adds & retrieves breadcrumbs for the current root span only', async () => {
    const beforeSend = jest.fn(() => null);
    const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);

    mockSdkInit({ beforeSend, beforeBreadcrumb, beforeSendTransaction, enableTracing: true });

    const hub = getCurrentHub();
    const client = hub.getClient() as NodeExperimentalClient;

    const error = new Error('test');

    startSpan({ name: 'test1' }, () => {
      hub.addBreadcrumb({ timestamp: 123456, message: 'test1-a' });

      startSpan({ name: 'inner1' }, () => {
        hub.addBreadcrumb({ timestamp: 123457, message: 'test1-b' });
      });
    });

    startSpan({ name: 'test2' }, () => {
      hub.addBreadcrumb({ timestamp: 123456, message: 'test2-a' });

      startSpan({ name: 'inner2' }, () => {
        hub.addBreadcrumb({ timestamp: 123457, message: 'test2-b' });
      });

      hub.captureException(error);
    });

    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeBreadcrumb).toHaveBeenCalledTimes(4);

    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        breadcrumbs: [
          { message: 'test2-a', timestamp: 123456 },
          { message: 'test2-b', timestamp: 123457 },
        ],
      }),
      {
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      },
    );
  });

  it('ignores scopes inside of root span', async () => {
    const beforeSend = jest.fn(() => null);
    const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);

    mockSdkInit({ beforeSend, beforeBreadcrumb, beforeSendTransaction, enableTracing: true });

    const hub = getCurrentHub();
    const client = hub.getClient() as NodeExperimentalClient;

    const error = new Error('test');

    startSpan({ name: 'test1' }, () => {
      withScope(() => {
        hub.addBreadcrumb({ timestamp: 123456, message: 'test1' });
      });
      startSpan({ name: 'inner1' }, () => {
        hub.addBreadcrumb({ timestamp: 123457, message: 'test2' });
      });

      hub.captureException(error);
    });

    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeBreadcrumb).toHaveBeenCalledTimes(2);

    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        breadcrumbs: [
          { message: 'test1', timestamp: 123456 },
          { message: 'test2', timestamp: 123457 },
        ],
      }),
      {
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      },
    );
  });

  it('handles deep nesting of scopes', async () => {
    const beforeSend = jest.fn(() => null);
    const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);

    mockSdkInit({ beforeSend, beforeBreadcrumb, beforeSendTransaction, enableTracing: true });

    const hub = getCurrentHub();
    const client = hub.getClient() as NodeExperimentalClient;

    const error = new Error('test');

    startSpan({ name: 'test1' }, () => {
      withScope(() => {
        hub.addBreadcrumb({ timestamp: 123456, message: 'test1' });
      });
      startSpan({ name: 'inner1' }, () => {
        hub.addBreadcrumb({ timestamp: 123457, message: 'test2' });

        startSpan({ name: 'inner2' }, () => {
          hub.addBreadcrumb({ timestamp: 123457, message: 'test3' });

          startSpan({ name: 'inner3' }, () => {
            hub.addBreadcrumb({ timestamp: 123457, message: 'test4' });

            hub.captureException(error);

            startSpan({ name: 'inner4' }, () => {
              hub.addBreadcrumb({ timestamp: 123457, message: 'test5' });
            });

            hub.addBreadcrumb({ timestamp: 123457, message: 'test6' });
          });
        });
      });

      hub.addBreadcrumb({ timestamp: 123456, message: 'test99' });
    });

    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);

    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        breadcrumbs: [
          { message: 'test1', timestamp: 123456 },
          { message: 'test2', timestamp: 123457 },
          { message: 'test3', timestamp: 123457 },
          { message: 'test4', timestamp: 123457 },
        ],
      }),
      {
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      },
    );
  });

  it('correctly adds & retrieves breadcrumbs in async spans', async () => {
    const beforeSend = jest.fn(() => null);
    const beforeBreadcrumb = jest.fn(breadcrumb => breadcrumb);

    mockSdkInit({ beforeSend, beforeBreadcrumb, beforeSendTransaction, enableTracing: true });

    const hub = getCurrentHub();
    const client = hub.getClient() as NodeExperimentalClient;

    const error = new Error('test');

    const promise1 = startSpan({ name: 'test' }, async () => {
      hub.addBreadcrumb({ timestamp: 123456, message: 'test1' });

      await startSpan({ name: 'inner1' }, async () => {
        hub.addBreadcrumb({ timestamp: 123457, message: 'test2' });
      });

      await startSpan({ name: 'inner2' }, async () => {
        hub.addBreadcrumb({ timestamp: 123455, message: 'test3' });
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      hub.captureException(error);
    });

    const promise2 = startSpan({ name: 'test-b' }, async () => {
      hub.addBreadcrumb({ timestamp: 123456, message: 'test1-b' });

      await startSpan({ name: 'inner1b' }, async () => {
        hub.addBreadcrumb({ timestamp: 123457, message: 'test2-b' });
      });

      await startSpan({ name: 'inner2b' }, async () => {
        hub.addBreadcrumb({ timestamp: 123455, message: 'test3-b' });
      });
    });

    await Promise.all([promise1, promise2]);

    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeBreadcrumb).toHaveBeenCalledTimes(6);

    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        breadcrumbs: [
          { message: 'test1', timestamp: 123456 },
          { message: 'test2', timestamp: 123457 },
          { message: 'test3', timestamp: 123455 },
        ],
      }),
      {
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      },
    );
  });
});
