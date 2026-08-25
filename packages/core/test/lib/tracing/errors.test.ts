import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE,
  setCurrentClient,
  spanToJSON,
  startInactiveSpan,
  startSpan,
} from '../../../src';
import * as globalErrorModule from '../../../src/instrument/globalError';
import * as globalUnhandledRejectionModule from '../../../src/instrument/globalUnhandledRejection';
import { _resetErrorsInstrumented, registerSpanErrorInstrumentation } from '../../../src/tracing/errors';
import type { HandlerDataError, HandlerDataUnhandledRejection } from '../../../src/types/instrument';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

let mockErrorCallback: (data: HandlerDataError) => void = () => {};
let mockUnhandledRejectionCallback: (data: HandlerDataUnhandledRejection) => void = () => {};

const mockAddGlobalErrorInstrumentationHandler = vi
  .spyOn(globalErrorModule, 'addGlobalErrorInstrumentationHandler')
  .mockImplementation(callback => {
    mockErrorCallback = callback;
  });
const mockAddGlobalUnhandledRejectionInstrumentationHandler = vi
  .spyOn(globalUnhandledRejectionModule, 'addGlobalUnhandledRejectionInstrumentationHandler')
  .mockImplementation(callback => {
    mockUnhandledRejectionCallback = callback;
  });

describe('registerErrorHandlers()', () => {
  beforeEach(() => {
    mockAddGlobalErrorInstrumentationHandler.mockClear();
    mockAddGlobalUnhandledRejectionInstrumentationHandler.mockClear();
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
    _resetErrorsInstrumented();
  });

  it('registers error instrumentation', () => {
    registerSpanErrorInstrumentation();
    expect(mockAddGlobalErrorInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockAddGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockAddGlobalErrorInstrumentationHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(mockAddGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it('does not set status if transaction is not on scope', () => {
    registerSpanErrorInstrumentation();

    const transaction = startInactiveSpan({ name: 'test' })!;
    expect(spanToJSON(transaction).status).toBe('ok');

    mockErrorCallback({} as HandlerDataError);
    expect(spanToJSON(transaction).status).toBe('ok');

    mockUnhandledRejectionCallback({});
    expect(spanToJSON(transaction).status).toBe('ok');

    transaction.end();
  });

  it('sets status for transaction on scope on error', () => {
    registerSpanErrorInstrumentation();

    startSpan({ name: 'test' }, span => {
      mockErrorCallback({} as HandlerDataError);
      const { status, attributes } = spanToJSON(span);
      expect(status).toBe('error');
      expect(attributes[SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE]).toBe('internal_error');
    });
  });

  it('sets status for transaction on scope on unhandledrejection', () => {
    registerSpanErrorInstrumentation();

    startSpan({ name: 'test' }, span => {
      mockUnhandledRejectionCallback({});
      const { status, attributes } = spanToJSON(span);
      expect(status).toBe('error');
      expect(attributes[SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE]).toBe('internal_error');
    });
  });
});
