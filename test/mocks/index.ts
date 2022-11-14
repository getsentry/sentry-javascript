import { jest } from '@jest/globals';
import { getCurrentHub } from '@sentry/core';
import { BASE_TIMESTAMP } from '@test';
import { DomHandler, MockTransportSend } from '@test/types';

import { ReplayConfiguration } from '../../src/types';

export async function resetSdkMock(options?: ReplayConfiguration) {
  let domHandler: DomHandler;

  jest.setSystemTime(new Date(BASE_TIMESTAMP));
  jest.clearAllMocks();
  jest.resetModules();
  // NOTE: The listeners added to `addInstrumentationHandler` are leaking
  // @ts-expect-error Don't know if there's a cleaner way to clean up old event processors
  globalThis.__SENTRY__.globalEventProcessors = [];
  const SentryUtils = await import('@sentry/utils');
  jest
    .spyOn(SentryUtils, 'addInstrumentationHandler')
    .mockImplementation((type, handler: (args: any) => any) => {
      if (type === 'dom') {
        domHandler = handler;
      }
    });
  const { mockRrweb } = await import('./mockRrweb');
  const { record: mockRecord } = mockRrweb();

  const { mockSdk } = await import('./mockSdk');
  const { replay } = await mockSdk({
    replayOptions: {
      ...options,
    },
  });

  const mockTransportSend = getCurrentHub()?.getClient()?.getTransport()
    ?.send as MockTransportSend;

  jest.runAllTimers();
  jest.setSystemTime(new Date(BASE_TIMESTAMP));

  return {
    // @ts-expect-error use before assign
    domHandler,
    mockRecord,
    mockTransportSend,
    replay,
  };
}
