import { API, BaseClient, Scope } from '@sentry/core';
import { DsnLike, Event, EventHint } from '@sentry/types';
import { getGlobalObject, logger } from '@sentry/utils';

import { BrowserBackend, BrowserOptions } from './backend';
import { Breadcrumbs } from './integrations';
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
  /** Callback after reportDialog showed up */
  onLoad?(): void;
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
  public constructor(options: BrowserOptions = {}) {
    super(BrowserBackend, options);
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null> {
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

    return super._prepareEvent(event, scope, hint);
  }

  /**
   * @inheritDoc
   */
  protected _sendEvent(event: Event): void {
    const integration = this.getIntegration(Breadcrumbs);
    if (integration) {
      integration.addSentryBreadcrumb(event);
    }
    super._sendEvent(event);
  }

  /**
   * Show a report dialog to the user to send feedback to a specific event.
   *
   * @param options Set individual options for the dialog
   */
  public showReportDialog(options: ReportDialogOptions = {}): void {
    // doesn't work without a document (React Native)
    const document = getGlobalObject<Window>().document;
    if (!document) {
      return;
    }

    if (!this._isEnabled()) {
      logger.error('Trying to call showReportDialog with Sentry Client is disabled');
      return;
    }

    const dsn = options.dsn || this.getDsn();

    if (!options.eventId) {
      logger.error('Missing `eventId` option in showReportDialog call');
      return;
    }

    if (!dsn) {
      logger.error('Missing `Dsn` option in showReportDialog call');
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = new API(dsn).getReportDialogEndpoint(options);

    if (options.onLoad) {
      script.onload = options.onLoad;
    }

    (document.head || document.body).appendChild(script);
  }
}
