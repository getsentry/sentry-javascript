import { addBreadcrumb, captureException, getClient, getCurrentHub, withScope } from '@sentry/core';

import { OpenTelemetryHub } from '../../src/custom/hub';
import { startSpan } from '../../src/trace';
import type { TestClientInterface } from '../helpers/TestClient';
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

      // eslint-disable-next-line deprecation/deprecation
      const hub = getCurrentHub();
      const client = getClient() as TestClientInterface;

      expect(hub).toBeInstanceOf(OpenTelemetryHub);

      addBreadcrumb({ timestamp: 123456, message: 'test1' });
      addBreadcrumb({ timestamp: 123457, message: 'test2', data: { nested: 'yes' } });
      addBreadcrumb({ timestamp: 123455, message: 'test3' });

      const error = new Error('test');
      // eslint-disable-next-line deprecation/deprecation
      captureException(error);

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

      // eslint-disable-next-line deprecation/deprecation
      const hub = getCurrentHub();
      const client = getClient() as TestClientInterface;

      expect(hub).toBeInstanceOf(OpenTelemetryHub);

      const error = new Error('test');

      addBreadcrumb({ timestamp: 123456, message: 'test0' });

      withScope(() => {
        addBreadcrumb({ timestamp: 123456, message: 'test1' });
      });

      withScope(() => {
        addBreadcrumb({ timestamp: 123456, message: 'test2' });
        // eslint-disable-next-line deprecation/deprecation
        captureException(error);
      });

      withScope(() => {
        addBreadcrumb({ timestamp: 123456, message: 'test3' });
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

    const client = getClient() as TestClientInterface;

    const error = new Error('test');

    startSpan({ name: 'test' }, () => {
      addBreadcrumb({ timestamp: 123456, message: 'test1' });

      startSpan({ name: 'inner1' }, () => {
        addBreadcrumb({ timestamp: 123457, message: 'test2', data: { nested: 'yes' } });
      });

      startSpan({ name: 'inner2' }, () => {
        addBreadcrumb({ timestamp: 123455, message: 'test3' });
      });

      captureException(error);
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

    const client = getClient() as TestClientInterface;

    const error = new Error('test');

    startSpan({ name: 'test1' }, () => {
      addBreadcrumb({ timestamp: 123456, message: 'test1-a' });

      startSpan({ name: 'inner1' }, () => {
        addBreadcrumb({ timestamp: 123457, message: 'test1-b' });
      });
    });

    startSpan({ name: 'test2' }, () => {
      addBreadcrumb({ timestamp: 123456, message: 'test2-a' });

      startSpan({ name: 'inner2' }, () => {
        addBreadcrumb({ timestamp: 123457, message: 'test2-b' });
      });

      captureException(error);
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

    const client = getClient() as TestClientInterface;

    const error = new Error('test');

    startSpan({ name: 'test1' }, () => {
      withScope(() => {
        addBreadcrumb({ timestamp: 123456, message: 'test1' });
      });
      startSpan({ name: 'inner1' }, () => {
        addBreadcrumb({ timestamp: 123457, message: 'test2' });
      });

      captureException(error);
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

    const client = getClient() as TestClientInterface;

    const error = new Error('test');

    startSpan({ name: 'test1' }, () => {
      withScope(() => {
        addBreadcrumb({ timestamp: 123456, message: 'test1' });
      });
      startSpan({ name: 'inner1' }, () => {
        addBreadcrumb({ timestamp: 123457, message: 'test2' });

        startSpan({ name: 'inner2' }, () => {
          addBreadcrumb({ timestamp: 123457, message: 'test3' });

          startSpan({ name: 'inner3' }, () => {
            addBreadcrumb({ timestamp: 123457, message: 'test4' });

            captureException(error);

            startSpan({ name: 'inner4' }, () => {
              addBreadcrumb({ timestamp: 123457, message: 'test5' });
            });

            addBreadcrumb({ timestamp: 123457, message: 'test6' });
          });
        });
      });

      addBreadcrumb({ timestamp: 123456, message: 'test99' });
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

    const client = getClient() as TestClientInterface;

    const error = new Error('test');

    const promise1 = startSpan({ name: 'test' }, async () => {
      addBreadcrumb({ timestamp: 123456, message: 'test1' });

      await startSpan({ name: 'inner1' }, async () => {
        addBreadcrumb({ timestamp: 123457, message: 'test2' });
      });

      await startSpan({ name: 'inner2' }, async () => {
        addBreadcrumb({ timestamp: 123455, message: 'test3' });
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      captureException(error);
    });

    const promise2 = startSpan({ name: 'test-b' }, async () => {
      addBreadcrumb({ timestamp: 123456, message: 'test1-b' });

      await startSpan({ name: 'inner1' }, async () => {
        addBreadcrumb({ timestamp: 123457, message: 'test2-b' });
      });

      await startSpan({ name: 'inner2' }, async () => {
        addBreadcrumb({ timestamp: 123455, message: 'test3-b' });
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
