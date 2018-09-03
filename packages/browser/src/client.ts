import { API, BaseClient, SentryError } from '@sentry/core';
import { DsnLike } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';
import { BrowserBackend, BrowserOptions } from './backend';

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BrowserClient extends BaseClient<BrowserBackend, BrowserOptions> {
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BrowserOptions) {
    super(BrowserBackend, options);
  }

  /** JSDoc */
  public showReportDialog(options: {
    [key: string]: any;
    eventId?: string;
    dsn?: DsnLike;
    user?: {
      email?: string;
      name?: string;
    };
    lang?: string;
    title?: string;
    subtitle?: string;
    subtitle2?: string;
    labelName?: string;
    labelEmail?: string;
    labelComments?: string;
    labelClose?: string;
    labelSubmit?: string;
    errorGeneric?: string;
    errorFormEntry?: string;
    successMessage?: string;
  }): void {
    // doesn't work without a document (React Native)
    const document = (getGlobalObject() as Window).document;
    if (!document) {
      return;
    }

    const dsn = options.dsn || this.getDsn();

    if (!options.eventId) {
      throw new SentryError('Missing `eventId` option in showReportDialog call');
    }

    if (!dsn) {
      throw new SentryError('Missing `Dsn` option in showReportDialog call');
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = new API(dsn).getReportDialogEndpoint(options);
    (document.head || document.body).appendChild(script);
  }
}
