import { HttpErrorResponse } from '@angular/common/http';
import { Scope } from '@sentry/browser';
import * as SentryBrowser from '@sentry/browser';
import * as SentryCore from '@sentry/core';
import * as SentryUtils from '@sentry/utils';

import { createErrorHandler, SentryErrorHandler } from '../src/errorhandler';

const FakeScope = new Scope();

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    captureException: (err: unknown, cb: (arg0?: unknown) => unknown) => {
      cb(FakeScope);
      return original.captureException(err, cb);
    },
  };
});

const captureExceptionSpy = jest.spyOn(SentryCore, 'captureException');

jest.spyOn(console, 'error').mockImplementation();

describe('SentryErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('`createErrorHandler `creates a SentryErrorHandler with an empty config', () => {
    const errorHandler = createErrorHandler();

    expect(errorHandler).toBeInstanceOf(SentryErrorHandler);
  });

  it('handleError method assigns the correct mechanism', () => {
    const addEventProcessorSpy = jest.spyOn(FakeScope, 'addEventProcessor').mockImplementationOnce(callback => {
      void callback({}, { event_id: 'fake-event-id' });
      return FakeScope;
    });

    const addExceptionMechanismSpy = jest.spyOn(SentryUtils, 'addExceptionMechanism');

    const errorHandler = createErrorHandler();
    errorHandler.handleError(new Error('test'));

    expect(addEventProcessorSpy).toBeCalledTimes(1);
    expect(addExceptionMechanismSpy).toBeCalledTimes(1);
    expect(addExceptionMechanismSpy).toBeCalledWith({}, { handled: false, type: 'angular' });
  });

  it('handleError method extracts `null` error', () => {
    createErrorHandler().handleError(null);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
  });

  it('handleError method extracts `undefined` error', () => {
    createErrorHandler().handleError(undefined);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
  });

  it('handleError method extracts a string', () => {
    const str = 'sentry-test';
    createErrorHandler().handleError(str);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(str, expect.any(Function));
  });

  it('handleError method extracts an empty Error', () => {
    const err = new Error();
    createErrorHandler().handleError(err);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(err, expect.any(Function));
  });

  it('handleError method extracts an Error with `ngOriginalError`', () => {
    const ngErr = new Error('sentry-ng-test');
    const err = {
      ngOriginalError: ngErr,
    };

    createErrorHandler().handleError(err);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(ngErr, expect.any(Function));
  });

  it('handleError method extracts an `HttpErrorResponse` with `Error`', () => {
    const httpErr = new Error('sentry-http-test');
    const err = new HttpErrorResponse({ error: httpErr });

    createErrorHandler().handleError(err);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(httpErr, expect.any(Function));
  });

  it('handleError method extracts an `HttpErrorResponse` with `ErrorEvent`', () => {
    const httpErr = new ErrorEvent('http', { message: 'sentry-http-test' });
    const err = new HttpErrorResponse({ error: httpErr });

    createErrorHandler().handleError(err);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith('sentry-http-test', expect.any(Function));
  });

  it('handleError method extracts an `HttpErrorResponse` with string', () => {
    const err = new HttpErrorResponse({ error: 'sentry-http-test' });
    createErrorHandler().handleError(err);

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      'Server returned code 0 with body "sentry-http-test"',
      expect.any(Function),
    );
  });

  it('handleError method shows report dialog', () => {
    const showReportDialogSpy = jest.spyOn(SentryBrowser, 'showReportDialog');

    const errorHandler = createErrorHandler({ showDialog: true });
    errorHandler.handleError(new Error('test'));

    expect(showReportDialogSpy).toBeCalledTimes(1);
  });

  it('handleError method extracts error with a custom extractor', () => {
    const customExtractor = (error: unknown) => {
      if (typeof error === 'string') {
        return new Error(`custom ${error}`);
      }
      return error;
    };

    const errorHandler = createErrorHandler({ extractor: customExtractor });
    errorHandler.handleError('error');

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).toHaveBeenCalledWith(new Error('custom error'), expect.any(Function));
  });
});
