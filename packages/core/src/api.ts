import { DSNLike } from '@sentry/types';
import { urlEncode } from '@sentry/utils/object';
import { DSN } from './dsn';

const SENTRY_API_VERSION = '7';

/** Helper class to provide urls to different Sentry endpoints. */
export class API {
  /** The internally used DSN object. */
  private dsnObject: DSN;
  /** Create a new instance of API */
  public constructor(public dsn: DSNLike) {
    this.dsnObject = new DSN(dsn);
  }

  /** Returns the DSN object. */
  public getDSN(): DSN {
    return this.dsnObject;
  }

  /** Returns a string with auth headers in the url to the store endpoint. */
  public getStoreEndpoint(urlEncodedHeader: boolean = false): string {
    const dsn = this.dsnObject;
    const auth = {
      sentry_key: dsn.user,
      sentry_secret: '',
      sentry_version: SENTRY_API_VERSION,
    };

    if (dsn.pass) {
      auth.sentry_secret = dsn.pass;
    } else {
      delete auth.sentry_secret;
    }

    const endpoint = `${this.getBaseUrl()}${this.getStoreEndpointPath()}`;

    // Auth is intentionally sent as part of query string (NOT as custom HTTP header)
    // to avoid preflight CORS requests
    if (urlEncodedHeader) {
      return `${endpoint}?${urlEncode(auth)}`;
    }
    return endpoint;
  }

  /** Returns the base path of the url including the port. */
  private getBaseUrl(): string {
    const dsn = this.dsnObject;
    const protocol = dsn.protocol ? `${dsn.protocol}:` : '';
    const port = dsn.port ? `:${dsn.port}` : '';
    return `${protocol}//${dsn.host}${port}`;
  }

  /** Returns only the path component for the store endpoint. */
  public getStoreEndpointPath(): string {
    const dsn = this.dsnObject;
    return `${dsn.path ? `/${dsn.path}` : ''}/api/${dsn.projectId}/store/`;
  }

  /** Returns an object that can be used in request headers. */
  public getRequestHeaders(clientName: string, clientVersion: string): { [key: string]: string } {
    const dsn = this.dsnObject;
    const header = [`Sentry sentry_version=${SENTRY_API_VERSION}`];
    header.push(`sentry_timestamp=${new Date().getTime()}`);
    header.push(`sentry_client=${clientName}/${clientVersion}`);
    header.push(`sentry_key=${dsn.user}`);
    if (dsn.pass) {
      header.push(`sentry_secret=${dsn.pass}`);
    }
    return {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': header.join(', '),
    };
  }

  /** Returns the url to the report dialog endpoint. */
  public getReportDialogEndpoint(dialogOptions: { [key: string]: any }): string {
    const dsn = this.dsnObject;
    const endpoint = `${this.getBaseUrl()}${dsn.path ? `/${dsn.path}` : ''}/api/embed/error-page/`;
    if (dialogOptions) {
      const encodedOptions = [];
      for (const key in dialogOptions) {
        if (key === 'user') {
          const user = dialogOptions.user;
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
          encodedOptions.push(`${encodeURIComponent(key)}=${encodeURIComponent(dialogOptions[key] as string)}`);
        }
      }
      if (encodedOptions.length) {
        return `${endpoint}?${encodedOptions.join('&')}`;
      }
    }
    return endpoint;
  }
}
