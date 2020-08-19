import { BrowserClient } from '@sentry/browser';
import { Hub, makeMain } from '@sentry/hub';

import { SpanStatus } from '../src';
import { registerErrorInstrumentation } from '../src/errors';
import { _addTracingExtensions } from '../src/hubextensions';

const mockAddInstrumentationHandler = jest.fn();
let mockErrorCallback: () => void = () => undefined;
let mockUnhandledRejectionCallback: () => void = () => undefined;
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: ({ callback, type }: any) => {
      if (type === 'error') {
        mockErrorCallback = callback;
      }
      if (type === 'unhandledrejection') {
        mockUnhandledRejectionCallback = callback;
      }
      if (typeof mockAddInstrumentationHandler === 'function') {
        return mockAddInstrumentationHandler({ callback, type });
      }
    },
  };
});

beforeAll(() => {
  _addTracingExtensions();
});

describe('registerErrorHandlers()', () => {
  let hub: Hub;
  beforeEach(() => {
    mockAddInstrumentationHandler.mockClear();
    hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
    makeMain(hub);
  });

  afterEach(() => {
    hub.configureScope(scope => scope.setSpan(undefined));
  });

  it('registers error instrumentation', () => {
    registerErrorInstrumentation();
    expect(mockAddInstrumentationHandler).toHaveBeenCalledTimes(2);
    expect(mockAddInstrumentationHandler).toHaveBeenNthCalledWith(1, { callback: expect.any(Function), type: 'error' });
    expect(mockAddInstrumentationHandler).toHaveBeenNthCalledWith(2, {
      callback: expect.any(Function),
      type: 'unhandledrejection',
    });
  });

  it('does not set status if transaction is not on scope', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    expect(transaction.status).toBe(undefined);

    mockErrorCallback();
    expect(transaction.status).toBe(undefined);

    mockUnhandledRejectionCallback();
    expect(transaction.status).toBe(undefined);
    transaction.finish();
  });

  it('sets status for transaction on scope on error', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    hub.configureScope(scope => scope.setSpan(transaction));

    mockErrorCallback();
    expect(transaction.status).toBe(SpanStatus.InternalError);

    transaction.finish();
  });

  it('sets status for transaction on scope on unhandledrejection', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    hub.configureScope(scope => scope.setSpan(transaction));

    mockUnhandledRejectionCallback();
    expect(transaction.status).toBe(SpanStatus.InternalError);
    transaction.finish();
  });
});
