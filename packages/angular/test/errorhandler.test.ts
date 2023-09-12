import { HttpErrorResponse } from '@angular/common/http';
import * as SentryBrowser from '@sentry/browser';
import { Scope } from '@sentry/browser';
import type { Event } from '@sentry/types';
import * as SentryUtils from '@sentry/utils';

import { createErrorHandler, SentryErrorHandler } from '../src/errorhandler';

const FakeScope = new Scope();

jest.mock('@sentry/browser', () => {
  const original = jest.requireActual('@sentry/browser');
  return {
    ...original,
    captureException: (err: unknown, cb: (arg0?: unknown) => unknown) => {
      cb(FakeScope);
      return original.captureException(err, cb);
    },
  };
});

const captureExceptionSpy = jest.spyOn(SentryBrowser, 'captureException');

jest.spyOn(console, 'error').mockImplementation();

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
    jest.clearAllMocks();
  });

  it('`createErrorHandler `creates a SentryErrorHandler with an empty config', () => {
    const errorHandler = createErrorHandler();

    expect(errorHandler).toBeInstanceOf(SentryErrorHandler);
  });

  describe('handleError method', () => {
    it('handleError method assigns the correct mechanism', () => {
      const addEventProcessorSpy = jest.spyOn(FakeScope, 'addEventProcessor').mockImplementationOnce(callback => {
        void (callback as (event: any, hint: any) => void)({}, { event_id: 'fake-event-id' });
        return FakeScope;
      });

      const addExceptionMechanismSpy = jest.spyOn(SentryUtils, 'addExceptionMechanism');

      const errorHandler = createErrorHandler();
      errorHandler.handleError(new Error('test'));

      expect(addEventProcessorSpy).toBeCalledTimes(1);
      expect(addExceptionMechanismSpy).toBeCalledTimes(1);
      expect(addExceptionMechanismSpy).toBeCalledWith({}, { handled: false, type: 'angular' });
    });

    it('extracts `null` error', () => {
      createErrorHandler().handleError(null);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts `undefined` error', () => {
      createErrorHandler().handleError(undefined);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts a string', () => {
      const str = 'sentry-test';
      createErrorHandler().handleError(str);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(str, expect.any(Function));
    });

    it('extracts an empty Error', () => {
      const err = new Error();
      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, expect.any(Function));
    });

    it('extracts a non-empty Error', () => {
      const err = new Error('sentry-test');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, expect.any(Function));
    });

    it('extracts an error-like object without stack', () => {
      const errorLikeWithoutStack: Error = {
        name: 'sentry-http-test',
        message: 'something failed.',
      };

      createErrorHandler().handleError(errorLikeWithoutStack);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(errorLikeWithoutStack, expect.any(Function));
    });

    it('extracts an error-like object with a stack', () => {
      const errorLikeWithStack: Error = {
        name: 'sentry-http-test',
        message: 'something failed.',
        stack: new Error().stack,
      };

      createErrorHandler().handleError(errorLikeWithStack);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(errorLikeWithStack, expect.any(Function));
    });

    it('extracts an object that could look like an error but is not (does not have a message)', () => {
      const notErr: Partial<Error> = {
        name: 'sentry-http-test',
        // missing message
      };

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts an object that could look like an error but is not (does not have an explicit name)', () => {
      const notErr: Partial<Error> = {
        message: 'something failed.',
      };

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts an object that could look like an error but is not: the name is of the wrong type', () => {
      const notErr = {
        name: true, // wrong type
        message: 'something failed',
      };

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts an object that could look like an error but is not: the message is of the wrong type', () => {
      const notErr = {
        name: 'sentry-http-error',
        message: true, // wrong type
      };

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts an instance of a class extending Error', () => {
      const err = new CustomError('something happened');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, expect.any(Function));
    });

    it('extracts an instance of class not extending Error but that has an error-like shape', () => {
      const err = new ErrorLikeShapedClass('sentry-error', 'something happened');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, expect.any(Function));
    });

    it('extracts an instance of a class that does not extend Error and does not have an error-like shape', () => {
      const notErr = new NonErrorShapedClass();

      createErrorHandler().handleError(notErr);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts ErrorEvent which has a string as an error', () => {
      const err = createErrorEvent('something happened', 'event failed');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts ErrorEvent which has an error as an error', () => {
      const err = createErrorEvent('something happened', new Error('event failed'));

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts ErrorEvent which has an error-like object as an error', () => {
      const innerErr: Error = {
        name: 'sentry-error',
        message: 'event failed',
      };
      const err = createErrorEvent('something happened', innerErr);

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts ErrorEvent which has a non-error-like object as an error', () => {
      const err = createErrorEvent('something happened', true);

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('Handled unknown error', expect.any(Function));
    });

    it('extracts an Error with `ngOriginalError`', () => {
      const ngErr = new Error('sentry-ng-test');
      const err = {
        ngOriginalError: ngErr,
      };

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(ngErr, expect.any(Function));
    });

    it('extracts an `HttpErrorResponse` with `Error`', () => {
      const httpErr = new Error('sentry-http-test');
      const err = new HttpErrorResponse({ error: httpErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(httpErr, expect.any(Function));
    });

    it('extracts an `HttpErrorResponse` with `ErrorEvent`', () => {
      const httpErr = new ErrorEvent('http', { message: 'sentry-http-test' });
      const err = new HttpErrorResponse({ error: httpErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('sentry-http-test', expect.any(Function));
    });

    it('extracts an `HttpErrorResponse` with string', () => {
      const err = new HttpErrorResponse({ error: 'sentry-http-test' });
      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Server returned code 0 with body "sentry-http-test"',
        expect.any(Function),
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
      expect(captureExceptionSpy).toHaveBeenCalledWith(errorLikeWithoutStack, expect.any(Function));
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
      expect(captureExceptionSpy).toHaveBeenCalledWith(errorLikeWithStack, expect.any(Function));
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
        expect.any(Function),
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
        expect.any(Function),
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
        expect.any(Function),
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
        expect.any(Function),
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
        expect.any(Function),
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
        expect.any(Function),
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
        expect.any(Function),
      );
    });

    it('extracts an `HttpErrorResponse` with an instance of a class extending Error', () => {
      const err = new CustomError('something happened');

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(err, expect.any(Function));
    });

    it('extracts an `HttpErrorResponse` with an instance of class not extending Error but that has an error-like shape', () => {
      const innerErr = new ErrorLikeShapedClass('sentry-error', 'something happened');
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(innerErr, expect.any(Function));
    });

    it('extracts an `HttpErrorResponse` with an instance of a class that does not extend Error and does not have an error-like shape', () => {
      const innerErr = new NonErrorShapedClass();
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        'Http failure response for (unknown url): undefined undefined',
        expect.any(Function),
      );
    });

    it('extracts an `HttpErrorResponse` with an ErrorEvent which has a string as an error', () => {
      const innerErr = createErrorEvent('something happened', 'event failed');
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('something happened', expect.any(Function));
    });

    it('extracts an `HttpErrorResponse` with an ErrorEvent which has an error as an error', () => {
      const innerErr = createErrorEvent('something happened', new Error('event failed'));
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('something happened', expect.any(Function));
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
      expect(captureExceptionSpy).toHaveBeenCalledWith('something happened', expect.any(Function));
    });

    it('extracts an `HttpErrorResponse` with an ErrorEvent which has a non-error-like object as an error', () => {
      const innerErr = createErrorEvent('something happened', true);
      const err = new HttpErrorResponse({ error: innerErr });

      createErrorHandler().handleError(err);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenCalledWith('something happened', expect.any(Function));
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
      expect(captureExceptionSpy).toHaveBeenCalledWith(new Error('custom error'), expect.any(Function));
    });

    describe('opens the report dialog if `showDialog` is true', () => {
      it('by using SDK lifecycle hooks if available', () => {
        const client = {
          cb: (_: Event) => {},
          on: jest.fn((_, cb) => {
            client.cb = cb;
          }),
        };

        // @ts-expect-error this is a minmal hub, we're missing a few props but that's ok
        jest.spyOn(SentryBrowser, 'getCurrentHub').mockImplementationOnce(() => {
          return { getClient: () => client };
        });

        const showReportDialogSpy = jest.spyOn(SentryBrowser, 'showReportDialog');

        const errorHandler = createErrorHandler({ showDialog: true });
        errorHandler.handleError(new Error('test'));
        expect(client.on).toHaveBeenCalledWith('afterSendEvent', expect.any(Function));

        // this simulates the afterSend hook being called
        client.cb({});

        expect(showReportDialogSpy).toBeCalledTimes(1);
      });

      it('by just calling `showReportDialog` if hooks are not available', () => {
        const showReportDialogSpy = jest.spyOn(SentryBrowser, 'showReportDialog');

        const errorHandler = createErrorHandler({ showDialog: true });
        errorHandler.handleError(new Error('test'));

        expect(showReportDialogSpy).toBeCalledTimes(1);
      });
    });
  });
});
