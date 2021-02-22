import { ReportDialogOptions } from '@sentry/browser';
import { Client } from '@sentry/types';

import { NextjsOptions } from './NextjsOptions';

/** Common interface for NextJS clients. */
export interface NextjsClient extends Client<NextjsOptions> {
  /** Shows the report dialog. */
  showReportDialog(dialogOptions: ReportDialogOptions): void;
}
