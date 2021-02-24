import { injectReportDialog, ReportDialogOptions } from '@sentry/browser';
import { BaseClient, getCurrentHub } from '@sentry/core';
import { logger } from '@sentry/utils';

import { NextjsClientInterface } from '../common/nextjsClient';
import { NextjsOptions } from '../common/nextjsOptions';
import { NextjsBrowserBackend } from './browserBackend';

/** */
export class NextjsBrowserClient extends BaseClient<NextjsBrowserBackend, NextjsOptions>
  implements NextjsClientInterface {
  /**
   * Creates a new NextJS SDK instace.
   * @param options config options for the NextJS SDK.
   */
  public constructor(options: NextjsOptions) {
    super(NextjsBrowserBackend, options);
  }

  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope The SDK scope used to upload.
   */
  captureMinidump(): string | undefined {
    logger.warn('captureMinidump is a NOOP in the browser');
    return undefined;
  }

  /** @inheritDoc */
  showReportDialog(dialogOptions: ReportDialogOptions): void {
    if (!dialogOptions.eventId) {
      dialogOptions.eventId = getCurrentHub().lastEventId();
    }
    injectReportDialog(dialogOptions);
  }

  // TODO: override `_prepareEvent` ?
}
