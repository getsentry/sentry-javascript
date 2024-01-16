import type { Event } from '../../src';
import { getActiveSpan, getClient, startInactiveSpan, startSpan, withActiveSpan } from '../../src';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

afterEach(() => {
  jest.restoreAllMocks();
  cleanupOtel();
});

describe('withActiveSpan()', () => {
  it('should set the active span within the callback', () => {
    mockSdkInit();

    const inactiveSpan = startInactiveSpan({ name: 'inactive-span' });

    expect(getActiveSpan()).not.toBe(inactiveSpan);

    withActiveSpan(inactiveSpan, () => {
      expect(getActiveSpan()).toBe(inactiveSpan);
    });
  });

  it('should create child spans when calling startSpan within the callback', async () => {
    const beforeSendTransaction = jest.fn(() => null);
    mockSdkInit({ enableTracing: true, beforeSendTransaction });
    const client = getClient();

    const inactiveSpan = startInactiveSpan({ name: 'inactive-span' });

    withActiveSpan(inactiveSpan, () => {
      startSpan({ name: 'child-span' }, () => {});
    });

    startSpan({ name: 'floating-span' }, () => {});

    inactiveSpan.end();

    await client.flush();

    // The child span should be a child of the inactive span
    expect(beforeSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: 'inactive-span',
        spans: expect.arrayContaining([expect.objectContaining({ description: 'child-span' })]),
      }),
      expect.anything(),
    );

    // The floating span should be a separate transaction
    expect(beforeSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: 'floating-span',
      }),
      expect.anything(),
    );
  });
});
