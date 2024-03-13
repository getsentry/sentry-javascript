import { HttpErrorResponse } from '@angular/common/http';
import * as SentryBrowser from '@sentry/browser';
import type { Client, Event } from '@sentry/types';
import { vi } from 'vitest';

import { SentryErrorHandler, createErrorHandler } from '../src/errorhandler';

const captureExceptionSpy = vi.spyOn(SentryBrowser, 'captureException');

vi.spyOn(console, 'error').mockImplementation(() => {});

const captureExceptionEventHint = {
  mechanism: { handled: false, type: 'angular' },
};

class CustomError extends Error {
  public name: string;

  constructor(public message: string) {
    super(message);

    this.name = 'CustomError';
  }
}

class ErrorLikeShapedClass implements Partial<Error> {
  constructor(public name: string, public message: string) {}
}

function createErrorEvent(message: string, innerError: any): ErrorEvent {
  return new ErrorEvent('something', { message, error: innerError });
}

class NonErrorShapedClass {}

describe('SentryErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('`createErrorHandler `creates a SentryErrorHandler with an empty config', () => {
    const errorHandler = createErrorHandler();

    expect(errorHandler).toBeInstanceOf(SentryErrorHandler);
  });

  describe('handleError method', () => {
    it('extracts `null` error', () => {
      createErrorHandler().handleError(null);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts `undefined` error', () => {
      createErrorHandler().handleError(undefined);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts a string', () => {
      const str = 'sentry-test';
      createErrorHandler().handleError(str);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(str, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts an empty Error', () => {
      const err = new Error();
      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts a non-empty Error', () => {
      const err = new Error('sentry-test');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts an error-like object without stack', () => {
      const errorLikeWithoutStack: Error = {
        name: 'sentry-http-test',
        message: 'something failed.',
      };

      createErrorHandler().handleError(errorLikeWithoutStack);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(errorLikeWithoutStack, captureExceptionEventHint);
    });

    it('extracts an error-like object with a stack', () => {
      const errorLikeWithStack: Error = {
        name: 'sentry-http-test',
        message: 'something failed.',
        stack: new Error().stack,
      };

      createErrorHandler().handleError(errorLikeWithStack);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(errorLikeWithStack, captureExceptionEventHint);
    });

    it('extracts an object that could look like an error but is not (does not have a message)', () => {
      const notErr: Partial<Error> = {
        name: 'sentry-http-test',
        // missing message
      };

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts an object that could look like an error but is not (does not have an explicit name)', () => {
      const notErr: Partial<Error> = {
        message: 'something failed.',
      };

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts an object that could look like an error but is not: the name is of the wrong type', () => {
      const notErr = {
        name: true, // wrong type
        message: 'something failed',
      };

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts an object that could look like an error but is not: the message is of the wrong type', () => {
      const notErr = {
        name: 'sentry-http-error',
        message: true, // wrong type
      };

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts an instance of a class extending Error', () => {
      const err = new CustomError('something happened');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts an instance of class not extending Error but that has an error-like shape', () => {
      const err = new ErrorLikeShapedClass('sentry-error', 'something happened');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts an instance of a class that does not extend Error and does not have an error-like shape', () => {
      const notErr = new NonErrorShapedClass();

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts ErrorEvent which has a string as an error', () => {
      const err = createErrorEvent('something happened', 'event failed');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts ErrorEvent which has an error as an error', () => {
      const err = createErrorEvent('something happened', new Error('event failed'));

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts ErrorEvent which has an error-like object as an error', () => {
      const innerErr: Error = {
        name: 'sentry-error',
        message: 'event failed',
      };
      const err = createErrorEvent('something happened', innerErr);

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts ErrorEvent which has a non-error-like object as an error', () => {
      const err = createErrorEvent('something happened', true);

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', captureExceptionEventHint);
    });

    it('extracts an Error with `ngOriginalError`', () => {
      const ngErr = new Error('sentry-ng-test');
      const err = {
        ngOriginalError: ngErr,
      };

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(ngErr, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts an `HttpErrorResponse` with `Error`', () => {
      const httpErr = new Error('sentry-http-test');
      const err = new HttpErrorResponse({ error: httpErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(httpErr, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts an `HttpErrorResponse` with `ErrorEvent`', () => {
      const httpErr = new ErrorEvent('http', { message: 'sentry-http-test' });
      const err = new HttpErrorResponse({ error: httpErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('sentry-http-test', captureExceptionEventHint);
    });

    it('extracts an `HttpErrorResponse` with string', () => {
      const err = new HttpErrorResponse({ error: 'sentry-http-test' });
      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Server returned code 0 with body "sentry-http-test"',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with error-like object without stack', () => {
      const errorLikeWithoutStack: Error = {
        name: 'sentry-http-test',
        message: 'something failed.',
      };
      const err = new HttpErrorResponse({ error: errorLikeWithoutStack });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(errorLikeWithoutStack, captureExceptionEventHint);
    });

    it('extracts an `HttpErrorResponse` with error-like object with a stack', () => {
      const errorLikeWithStack: Error = {
        name: 'sentry-http-test',
        message: 'something failed.',
        stack: new Error().stack,
      };
      const err = new HttpErrorResponse({ error: errorLikeWithStack });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(errorLikeWithStack, captureExceptionEventHint);
    });

    it('extracts an `HttpErrorResponse` with an object that could look like an error but is not (does not have a message)', () => {
      const notErr: Partial<Error> = {
        name: 'sentry-http-test',
        // missing message
      };
      const err = new HttpErrorResponse({ error: notErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with an object that could look like an error but is not (does not have an explicit name)', () => {
      const notErr: Partial<Error> = {
        message: 'something failed.',
      };
      const err = new HttpErrorResponse({ error: notErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with an object that could look like an error but is not: the name is of the wrong type', () => {
      const notErr = {
        name: true, // wrong type
        message: 'something failed',
      };
      const err = new HttpErrorResponse({ error: notErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with an object that could look like an error but is not: the message is of the wrong type', () => {
      const notErr = {
        name: 'sentry-http-error',
        message: true, // wrong type
      };
      const err = new HttpErrorResponse({ error: notErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with an object that could look like an error but is not: the stack is of the wrong type', () => {
      const notErr = {
        name: 'sentry-http-error',
        message: 'something failed',
        stack: true, // wrong type
      };
      const err = new HttpErrorResponse({ error: notErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with an error-event which contains an error', () => {
      const notErr = {
        name: 'sentry-http-error',
        message: 'something failed',
        stack: true, // wrong type
      };
      const err = new HttpErrorResponse({ error: notErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with an object that could look like an error but is not: the message is of the wrong type', () => {
      const notErr = {
        name: 'sentry-http-error',
        message: true, // wrong type
      };
      const err = new HttpErrorResponse({ error: notErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with an instance of a class extending Error', () => {
      const err = new CustomError('something happened');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts an `HttpErrorResponse` with an instance of class not extending Error but that has an error-like shape', () => {
      const innerErr = new ErrorLikeShapedClass('sentry-error', 'something happened');
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(innerErr, { mechanism: { handled: false, type: 'angular' } });
    });

    it('extracts an `HttpErrorResponse` with an instance of a class that does not extend Error and does not have an error-like shape', () => {
      const innerErr = new NonErrorShapedClass();
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        captureExceptionEventHint,
      );
    });

    it('extracts an `HttpErrorResponse` with an ErrorEvent which has a string as an error', () => {
      const innerErr = createErrorEvent('something happened', 'event failed');
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('something happened', captureExceptionEventHint);
    });

    it('extracts an `HttpErrorResponse` with an ErrorEvent which has an error as an error', () => {
      const innerErr = createErrorEvent('something happened', new Error('event failed'));
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('something happened', captureExceptionEventHint);
    });

    it('extracts an `HttpErrorResponse` with an ErrorEvent which has an error-like object as an error', () => {
      const innerErrorEventErr: Error = {
        name: 'sentry-error',
        message: 'something happened',
      };
      const innerErr = createErrorEvent('something happened', innerErrorEventErr);
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('something happened', captureExceptionEventHint);
    });

    it('extracts an `HttpErrorResponse` with an ErrorEvent which has a non-error-like object as an error', () => {
      const innerErr = createErrorEvent('something happened', true);
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('something happened', captureExceptionEventHint);
    });

    it('extracts error with a custom extractor', () => {
      const customExtractor = (error: unknown) => {
        if (typeof error === 'string') {
          return new Error(`custom ${error}`);
        }
        return error;
      };

      const errorHandler = createErrorHandler({ extractor: customExtractor });
      errorHandler.handleError('error');

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(new Error('custom error'), captureExceptionEventHint);
    });

    describe('opens the report dialog if `showDialog` is true', () => {
      it('by using SDK lifecycle hooks if available', () => {
        const client = {
          cb: (_: Event) => {},
          on: vi.fn((_, cb) => {
            client.cb = cb;
          }),
        };

        vi.spyOn(SentryBrowser, 'getClient').mockImplementationOnce(() => client as unknown as Client);

        const showReportDialogSpy = vi.spyOn(SentryBrowser, 'showReportDialog');

        const errorHandler = createErrorHandler({ showDialog: true });
        errorHandler.handleError(new Error('test'));
        expect(client.on).toHaveBeenCalledWith('afterSendEvent', expect.any(Function));

        // this simulates the afterSend hook being called
        client.cb({ event_id: 'foobar' });

        expect(showReportDialogSpy).toBeCalledTimes(1);
      });

      it('by just calling `showReportDialog` if hooks are not available', () => {
        const showReportDialogSpy = vi.spyOn(SentryBrowser, 'showReportDialog');

        const errorHandler = createErrorHandler({ showDialog: true });
        errorHandler.handleError(new Error('test'));

        expect(showReportDialogSpy).toBeCalledTimes(1);
      });
    });
  });
});
