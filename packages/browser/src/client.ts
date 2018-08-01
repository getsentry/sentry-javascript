import { BaseClient, DSN, SentryError } from '@sentry/core';
import { DSNLike } from '@sentry/types';
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
    dsn?: DSNLike;
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

    const dsn = options.dsn || this.getDSN();

    if (!options.eventId) {
      throw new SentryError('Missing `eventId` option in showReportDialog call');
    }

    if (!dsn) {
      throw new SentryError('Missing `DSN` option in showReportDialog call');
    }

    const encodedOptions = [];
    for (const key in options) {
      if (key === 'user') {
        const user = options.user;
        if (!user) {
          continue;
        }

        if (user.name) {
          encodedOptions.push(`name=${encodeURIComponent(user.name)}`);
        }
        if (user.email) {
          encodedOptions.push(`email=${encodeURIComponent(user.email)}`);
        }
      } else {
        encodedOptions.push(`${encodeURIComponent(key)}=${encodeURIComponent(options[key] as string)}`);
      }
    }

    const parsedDSN = new DSN(dsn);
    const protocol = parsedDSN.protocol ? `${parsedDSN.protocol}:` : '';
    const port = parsedDSN.port ? `:${parsedDSN.port}` : '';
    const path = parsedDSN.path ? `/${parsedDSN.path}` : '';
    const src = `${protocol}//${parsedDSN.host}${port}${path}/api/embed/error-page/?${encodedOptions.join('&')}`;

    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    (document.head || document.body).appendChild(script);
  }
}
