import { eventFromException, eventFromMessage } from '@sentry/browser';
import { BaseBackend } from '@sentry/core';
import { Event, EventHint, Scope, Severity } from '@sentry/types';

import { CommonBackend } from '../common/nextjsBackend';
import { NextjsOptions } from '../common/nextjsOptions';

/**
 * Store the IPC interface on a window, so that both regular and isolated contexts are the same.
 */
declare global {
  interface Window {
    __SENTRY_IPC__:
      | {
          sendScope: (scope: Scope) => void;
          sendEvent: (event: Event) => void;
          pingMain: (success: () => void) => void;
        }
      | undefined;
  }
}

/** */
export class NextjsBrowserBackend extends BaseBackend<NextjsOptions> implements CommonBackend<NextjsOptions> {
  public constructor(options: NextjsOptions) {
    super(options);
  }

  /** @inheritDoc */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public eventFromException(_exception: any, _hint?: EventHint): PromiseLike<Event> {
    return eventFromException(this._options, _exception, _hint);
  }

  /** @inheritDoc */
  public eventFromMessage(_message: string, _level?: Severity, _hint?: EventHint): PromiseLike<Event> {
    return eventFromMessage(this._options, _message, _level, _hint);
  }

  /** @inheritDoc */
  public sendEvent(event: Event): void {
    window.__SENTRY_IPC__?.sendEvent(event);
  }
}
