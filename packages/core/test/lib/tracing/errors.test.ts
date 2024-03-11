import type { HandlerDataError, HandlerDataUnhandledRejection } from '@sentry/types';
import { addTracingExtensions, setCurrentClient, spanToJSON, startInactiveSpan, startSpan } from '../../../src';

import { _resetErrorsInstrumented, registerErrorInstrumentation } from '../../../src/tracing/errors';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

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
  beforeEach(() => {
    mockAddGlobalErrorInstrumentationHandler.mockClear();
    mockAddGlobalUnhandledRejectionInstrumentationHandler.mockClear();
    const options = getDefaultTestClientOptions({ enableTracing: true });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
    _resetErrorsInstrumented();
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

    const transaction = startInactiveSpan({ name: 'test' })!;
    expect(spanToJSON(transaction).status).toBe(undefined);

    mockErrorCallback({} as HandlerDataError);
    expect(spanToJSON(transaction).status).toBe(undefined);

    mockUnhandledRejectionCallback({});
    expect(spanToJSON(transaction).status).toBe(undefined);

    transaction.end();
  });

  it('sets status for transaction on scope on error', () => {
    registerErrorInstrumentation();

    startSpan({ name: 'test' }, span => {
      mockErrorCallback({} as HandlerDataError);
      expect(spanToJSON(span).status).toBe('internal_error');
    });
  });

  it('sets status for transaction on scope on unhandledrejection', () => {
    registerErrorInstrumentation();

    startSpan({ name: 'test' }, span => {
      mockUnhandledRejectionCallback({});
      expect(spanToJSON(span).status).toBe('internal_error');
    });
  });
});
