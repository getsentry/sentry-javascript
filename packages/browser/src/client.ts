import { API, BaseClient, Scope, SentryError } from '@sentry/core';
import { DsnLike, SentryEvent, SentryEventHint } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils/misc';
import { BrowserBackend, BrowserOptions } from './backend';
import { SDK_NAME, SDK_VERSION } from './version';

/**
 * All properties the report dialog supports
 */
export interface ReportDialogOptions {
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
}

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

  /**
   * @inheritDoc
   */
  protected async prepareEvent(event: SentryEvent, scope?: Scope, hint?: SentryEventHint): Promise<SentryEvent | null> {
    event.platform = event.platform || 'javascript';
    event.sdk = {
      ...event.sdk,
      name: SDK_NAME,
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/browser',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    return super.prepareEvent(event, scope, hint);
  }

  /**
   * Show a report dialog to the user to send feedback to a specific event.
   *
   * @param options Set individual options for the dialog
   */
  public showReportDialog(options: ReportDialogOptions = {}): void {
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
