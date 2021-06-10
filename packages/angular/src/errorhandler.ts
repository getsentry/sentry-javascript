import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler as AngularErrorHandler, Injectable } from '@angular/core';
import * as Sentry from '@sentry/browser';

import { runOutsideAngular } from './zone';

/**
 * Options used to configure the behavior of the Angular ErrorHandler.
 */
export interface ErrorHandlerOptions {
  logErrors?: boolean;
  showDialog?: boolean;
  dialogOptions?: Sentry.ReportDialogOptions;
  /**
   * Custom implementation of error extraction from the raw value captured by the Angular.
   * @param error Value captured by Angular's ErrorHandler provider
   * @param defaultExtractor Default implementation that can be used as the fallback in case of custom implementation
   */
  extractor?(error: unknown, defaultExtractor: (error: unknown) => unknown): unknown;
}

/**
 * Implementation of Angular's ErrorHandler provider that can be used as a drop-in replacement for the stock one.
 */
@Injectable({ providedIn: 'root' })
class SentryErrorHandler implements AngularErrorHandler {
  protected readonly _options: ErrorHandlerOptions;

  public constructor(options?: ErrorHandlerOptions) {
    this._options = {
      logErrors: true,
      ...options,
    };
  }

  /**
   * Method called for every value captured through the ErrorHandler
   */
  public handleError(error: unknown): void {
    const extractedError = this._extractError(error) || 'Handled unknown error';

    // Capture handled exception and send it to Sentry.
    const eventId = runOutsideAngular(() => Sentry.captureException(extractedError));

    // When in development mode, log the error to console for immediate feedback.
    if (this._options.logErrors) {
      // eslint-disable-next-line no-console
      console.error(extractedError);
    }

    // Optionally show user dialog to provide details on what happened.
    if (this._options.showDialog) {
      Sentry.showReportDialog({ ...this._options.dialogOptions, eventId });
    }
  }

  /**
   * Used to pull a desired value that will be used to capture an event out of the raw value captured by ErrorHandler.
   */
  protected _extractError(error: unknown): unknown {
    // Allow custom overrides of extracting function
    if (this._options.extractor) {
      const defaultExtractor = this._defaultExtractor.bind(this);
      return this._options.extractor(error, defaultExtractor);
    }

    return this._defaultExtractor(error);
  }

  /**
   * Default implementation of error extraction that handles default error wrapping, HTTP responses, ErrorEvent and few other known cases.
   */
  protected _defaultExtractor(errorCandidate: unknown): unknown {
    let error = errorCandidate;

    // Try to unwrap zone.js error.
    // https://github.com/angular/angular/blob/master/packages/core/src/util/errors.ts
    if (error && (error as { ngOriginalError: Error }).ngOriginalError) {
      error = (error as { ngOriginalError: Error }).ngOriginalError;
    }

    // We can handle messages and Error objects directly.
    if (typeof error === 'string' || error instanceof Error) {
      return error;
    }

    // If it's http module error, extract as much information from it as we can.
    if (error instanceof HttpErrorResponse) {
      // The `error` property of http exception can be either an `Error` object, which we can use directly...
      if (error.error instanceof Error) {
        return error.error;
      }

      // ... or an`ErrorEvent`, which can provide us with the message but no stack...
      if (error.error instanceof ErrorEvent && error.error.message) {
        return error.error.message;
      }

      // ...or the request body itself, which we can use as a message instead.
      if (typeof error.error === 'string') {
        return `Server returned code ${error.status} with body "${error.error}"`;
      }

      // If we don't have any detailed information, fallback to the request message itself.
      return error.message;
    }

    // Nothing was extracted, fallback to default error message.
    return null;
  }
}

/**
 * Factory function that creates an instance of a preconfigured ErrorHandler provider.
 */
function createErrorHandler(config?: ErrorHandlerOptions): SentryErrorHandler {
  return new SentryErrorHandler(config);
}

export { createErrorHandler, SentryErrorHandler };
