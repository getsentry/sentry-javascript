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

    // TODO: Fix default DSN, eventId and user
    // tslint:disable-next-line:no-parameter-reassignment
    options = {
      dsn: 'FIXME',
      eventId: 'FIXME',
      user: {
        email: 'FIXME',
        name: 'FIXME',
      },
      ...options,
    };

    if (!options.eventId) {
      throw new SentryError('Missing `eventId` option in showReportDialog call');
    }

    if (!options.dsn) {
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
        encodedOptions.push(`${encodeURIComponent(key)}=${encodeURIComponent(options[key])}`);
      }
    }

    const parsedDSN = new DSN(options.dsn);
    const protocol = parsedDSN.protocol ? `${parsedDSN.protocol}:` : '';
    const port = parsedDSN.port ? `:${parsedDSN.port}` : '';
    const src = `${protocol}//${parsedDSN.host}${port}/api/embed/error-page/?${encodedOptions.join('&')}`;

    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    (document.head || document.body).appendChild(script);
  }
}
