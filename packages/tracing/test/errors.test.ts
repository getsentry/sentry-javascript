import { BrowserClient } from '@sentry/browser';
import { setupBrowserTransport } from '@sentry/browser/src/transports';
import { Hub, makeMain } from '@sentry/hub';
import { InstrumentHandlerCallback, InstrumentHandlerType } from '@sentry/utils';

import { registerErrorInstrumentation } from '../src/errors';
import { _addTracingExtensions } from '../src/hubextensions';
import { NoopTransport } from '@sentry/core/src/transports/noop';

const mockAddInstrumentationHandler = jest.fn();
let mockErrorCallback: InstrumentHandlerCallback = () => undefined;
let mockUnhandledRejectionCallback: InstrumentHandlerCallback = () => undefined;
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: (type: InstrumentHandlerType, callback: InstrumentHandlerCallback) => {
      if (type === 'error') {
        mockErrorCallback = callback;
      }
      if (type === 'unhandledrejection') {
        mockUnhandledRejectionCallback = callback;
      }
      if (typeof mockAddInstrumentationHandler === 'function') {
        return mockAddInstrumentationHandler(type, callback);
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
    const options = { tracesSampleRate: 1, transport: NoopTransport, integrations: [], stackParser: () => [] };
    hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
    makeMain(hub);
  });

  afterEach(() => {
    hub.configureScope(scope => scope.setSpan(undefined));
  });

  it('registers error instrumentation', () => {
    registerErrorInstrumentation();
    expect(mockAddInstrumentationHandler).toHaveBeenCalledTimes(2);
    expect(mockAddInstrumentationHandler).toHaveBeenNthCalledWith(1, 'error', expect.any(Function));
    expect(mockAddInstrumentationHandler).toHaveBeenNthCalledWith(2, 'unhandledrejection', expect.any(Function));
  });

  it('does not set status if transaction is not on scope', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    expect(transaction.status).toBe(undefined);

    mockErrorCallback({});
    expect(transaction.status).toBe(undefined);

    mockUnhandledRejectionCallback({});
    expect(transaction.status).toBe(undefined);
    transaction.finish();
  });

  it('sets status for transaction on scope on error', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    hub.configureScope(scope => scope.setSpan(transaction));

    mockErrorCallback({});
    expect(transaction.status).toBe('internal_error');

    transaction.finish();
  });

  it('sets status for transaction on scope on unhandledrejection', () => {
    registerErrorInstrumentation();
    const transaction = hub.startTransaction({ name: 'test' });
    hub.configureScope(scope => scope.setSpan(transaction));

    mockUnhandledRejectionCallback({});
    expect(transaction.status).toBe('internal_error');
    transaction.finish();
  });
});
