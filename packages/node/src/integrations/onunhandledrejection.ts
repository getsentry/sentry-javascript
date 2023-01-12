import type { Scope } from '@sentry/core';
import { getCurrentHub } from '@sentry/core';
import type { Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

import { logAndExitProcess } from './utils/errorhandling';

type UnhandledRejectionMode = 'none' | 'warn' | 'strict';

/** Global Promise Rejection handler */
export class OnUnhandledRejection implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'OnUnhandledRejection';

  /**
   * @inheritDoc
   */
  public name: string = OnUnhandledRejection.id;

  /**
   * @inheritDoc
   */
  public constructor(
    private readonly _options: {
      /**
       * Option deciding what to do after capturing unhandledRejection,
       * that mimicks behavior of node's --unhandled-rejection flag.
       */
      mode: UnhandledRejectionMode;
    } = { mode: 'warn' },
  ) {}

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    global.process.on('unhandledRejection', this.sendUnhandledPromise.bind(this));
  }

  /**
   * Send an exception with reason
   * @param reason string
   * @param promise promise
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
  public sendUnhandledPromise(reason: any, promise: any): void {
    const hub = getCurrentHub();
    if (hub.getIntegration(OnUnhandledRejection)) {
      hub.withScope((scope: Scope) => {
        scope.setExtra('unhandledPromiseRejection', true);
        hub.captureException(reason, {
          originalException: promise,
          data: { mechanism: { handled: false, type: 'onunhandledrejection' } },
        });
      });
    }
    this._handleRejection(reason);
  }

  /**
   * Handler for `mode` option
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _handleRejection(reason: any): void {
    // https://github.com/nodejs/node/blob/7cf6f9e964aa00772965391c23acda6d71972a9a/lib/internal/process/promises.js#L234-L240
    const rejectionWarning =
      'This error originated either by ' +
      'throwing inside of an async function without a catch block, ' +
      'or by rejecting a promise which was not handled with .catch().' +
      ' The promise rejected with the reason:';

    /* eslint-disable no-console */
    if (this._options.mode === 'warn') {
      consoleSandbox(() => {
        console.warn(rejectionWarning);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        console.error(reason && reason.stack ? reason.stack : reason);
      });
    } else if (this._options.mode === 'strict') {
      consoleSandbox(() => {
        console.warn(rejectionWarning);
      });
      logAndExitProcess(reason);
    }
    /* eslint-enable no-console */
  }
}
