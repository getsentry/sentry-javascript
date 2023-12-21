import { BrowserClient } from '@sentry/browser';
import { Hub, addTracingExtensions, makeMain } from '@sentry/core';
import type { HandlerDataError, HandlerDataUnhandledRejection } from '@sentry/types';

import { getDefaultBrowserClientOptions } from '../../../../tracing/test/testutils';
import { registerErrorInstrumentation } from '../../../src/tracing/errors';

const mockAddGlobalErrorInstrumentationHandler = jest.fn();
const mockAddGlobalUnhandledRejectionInstrumentationHandler = jest.fn();
let mockErrorCallback: (data: HandlerDataError) => void = () => {};
let mockUnhandledRejectionCallback: (data: HandlerDataUnhandledRejection) => void = () => {};
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addGlobalErrorInstrumentationHandler: (callback: () => void) => {
      mockErrorCallback = callback;

      return mockAddGlobalErrorInstrumentationHandler(callback);
    },
    addGlobalUnhandledRejectionInstrumentationHandler: (callback: () => void) => {
      mockUnhandledRejectionCallback = callback;
      return mockAddGlobalUnhandledRejectionInstrumentationHandler(callback);
    },
  };
});

beforeAll(() => {
  addTracingExtensions();
});

describe('registerErrorHandlers()', () => {
  let hub: Hub;
  beforeEach(() => {
    mockAddGlobalErrorInstrumentationHandler.mockClear();
    mockAddGlobalUnhandledRejectionInstrumentationHandler.mockClear();
    const options = getDefaultBrowserClientOptions();
    hub = new Hub(new BrowserClient(options));
    makeMain(hub);
  });

  afterEach(() => {
    hub.getScope().setSpan(undefined);
  });

  it('registers error instrumentation', () => {
    registerErrorInstrumentation();
    expect(mockAddGlobalErrorInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockAddGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockAddGlobalErrorInstrumentationHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(mockAddGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it('does not set status if transaction is not on scope', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    expect(transaction.status).toBe(undefined);

    mockErrorCallback({} as HandlerDataError);
    expect(transaction.status).toBe(undefined);

    mockUnhandledRejectionCallback({});
    expect(transaction.status).toBe(undefined);
    transaction.end();
  });

  it('sets status for transaction on scope on error', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    hub.getScope().setSpan(transaction);

    mockErrorCallback({} as HandlerDataError);
    expect(transaction.status).toBe('internal_error');

    transaction.end();
  });

  it('sets status for transaction on scope on unhandledrejection', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    hub.getScope().setSpan(transaction);

    mockUnhandledRejectionCallback({});
    expect(transaction.status).toBe('internal_error');
    transaction.end();
  });
});
