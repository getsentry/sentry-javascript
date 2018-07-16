import { BaseClient, DSN, SentryError } from '@sentry/core';
import { DSNLike, SdkInfo } from '@sentry/types';
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

  /**
   * @inheritDoc
   */
  public getSdkInfo(): SdkInfo {
    return {
      name: 'sentry-browser',
      version: '4.0.0-beta.6',
    };
  }

  /**
   * TODO
   */
  public showReportDialog(options: {
    eventId?: string;
    dsn?: DSNLike;
    user?: {
      name?: string;
      email?: string;
    };
  }): void {
    // doesn't work without a document (React Native)
    const document = (getGlobalObject() as Window).document;
    if (!document) {
      return;
    }

    if (!options) {
      throw new SentryError('Missing `options` object in showReportDialog call');
    }
    if (!options.eventId) {
      throw new SentryError('Missing `eventId` option in showReportDialog call');
    }
    if (!options.dsn) {
      throw new SentryError('Missing `DSN` option in showReportDialog call');
    }

    // TODO: Get default eventId from `this.lastEventId()` when ported
    // TODO: Get default DSN from `this.getDsn()` or something when ported
    const dsnInstance = new DSN(options.dsn);
    let qs = `?eventId=${encodeURIComponent(options.eventId)}&dsn=${encodeURIComponent(dsnInstance.toString())}`;

    const user = options.user;
    if (user) {
      if (user.name) {
        qs += `&name=${encodeURIComponent(user.name)}`;
      }
      if (user.email) {
        qs += `&email=${encodeURIComponent(user.email)}`;
      }
    }

    const protocol = dsnInstance.protocol ? `${dsnInstance.protocol}:` : '';
    const port = dsnInstance.port ? `:${dsnInstance.port}` : '';
    const src = `${protocol}//${dsnInstance.host}${port}/api/embed/error-page/${qs}`;

    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    (document.head || document.body).appendChild(script);
  }
}
