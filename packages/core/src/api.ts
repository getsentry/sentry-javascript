import { DsnLike, SdkMetadata } from '@sentry/types';
import { Dsn, urlEncode } from '@sentry/utils';

const SENTRY_API_VERSION = '7';

/**
 * Helper class to provide urls, headers and metadata that can be used to form
 * different types of requests to Sentry endpoints.
 * Supports both envelopes and regular event requests.
 **/
export class API {
  /** The DSN as passed to Sentry.init() */
  public dsn: DsnLike;

  /** Metadata about the SDK (name, version, etc) for inclusion in envelope headers */
  public metadata: SdkMetadata;

  /** The internally used Dsn object. */
  private readonly _dsnObject: Dsn;

  /** The envelope tunnel to use. */
  private readonly _envelopeTunnel?: string;

  /** Create a new instance of API */
  public constructor(dsn: DsnLike, metadata: SdkMetadata = {}, envelopeTunnel?: string) {
    this.dsn = dsn;
    this._dsnObject = new Dsn(dsn);
    this.metadata = metadata;
    this._envelopeTunnel = envelopeTunnel;
  }

  /** Returns the Dsn object. */
  public getDsn(): Dsn {
    return this._dsnObject;
  }

  /** Does this transport force envelopes? */
  public forceEnvelope(): boolean {
    return !!this._envelopeTunnel;
  }

  /** Returns the prefix to construct Sentry ingestion API endpoints. */
  public getBaseApiEndpoint(): string {
    const dsn = this.getDsn();
    const protocol = dsn.protocol ? `${dsn.protocol}:` : '';
    const port = dsn.port ? `:${dsn.port}` : '';
    return `${protocol}//${dsn.host}${port}${dsn.path ? `/${dsn.path}` : ''}/api/`;
  }

  /** Returns the store endpoint URL. */
  public getStoreEndpoint(): string {
    return this._getIngestEndpoint('store');
  }

  /**
   * Returns the store endpoint URL with auth in the query string.
   *
   * Sending auth as part of the query string and not as custom HTTP headers avoids CORS preflight requests.
   */
  public getStoreEndpointWithUrlEncodedAuth(): string {
    return `${this.getStoreEndpoint()}?${this._encodedAuth()}`;
  }

  /**
   * Returns the envelope endpoint URL with auth in the query string.
   *
   * Sending auth as part of the query string and not as custom HTTP headers avoids CORS preflight requests.
   */
  public getEnvelopeEndpointWithUrlEncodedAuth(): string {
    if (this.forceEnvelope()) {
      return this._envelopeTunnel as string;
    }

    return `${this._getEnvelopeEndpoint()}?${this._encodedAuth()}`;
  }

  /** Returns only the path component for the store endpoint. */
  public getStoreEndpointPath(): string {
    const dsn = this.getDsn();
    return `${dsn.path ? `/${dsn.path}` : ''}/api/${dsn.projectId}/store/`;
  }

  /**
   * Returns an object that can be used in request headers.
   * This is needed for node and the old /store endpoint in sentry
   */
  public getRequestHeaders(clientName: string, clientVersion: string): { [key: string]: string } {
    // CHANGE THIS to use metadata but keep clientName and clientVersion compatible
    const dsn = this.getDsn();
    const header = [`Sentry sentry_version=${SENTRY_API_VERSION}`];
    header.push(`sentry_client=${clientName}/${clientVersion}`);
    header.push(`sentry_key=${dsn.publicKey}`);
    if (dsn.pass) {
      header.push(`sentry_secret=${dsn.pass}`);
    }
    return {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': header.join(', '),
    };
  }

  /** Returns the url to the report dialog endpoint. */
  public getReportDialogEndpoint(
    dialogOptions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
      user?: { name?: string; email?: string };
    } = {},
  ): string {
    const dsn = this.getDsn();
    const endpoint = `${this.getBaseApiEndpoint()}embed/error-page/`;

    const encodedOptions = [];
    encodedOptions.push(`dsn=${dsn.toString()}`);
    for (const key in dialogOptions) {
      if (key === 'dsn') {
        continue;
      }

      if (key === 'user') {
        if (!dialogOptions.user) {
          continue;
        }
        if (dialogOptions.user.name) {
          encodedOptions.push(`name=${encodeURIComponent(dialogOptions.user.name)}`);
        }
        if (dialogOptions.user.email) {
          encodedOptions.push(`email=${encodeURIComponent(dialogOptions.user.email)}`);
        }
      } else {
        encodedOptions.push(`${encodeURIComponent(key)}=${encodeURIComponent(dialogOptions[key] as string)}`);
      }
    }
    if (encodedOptions.length) {
      return `${endpoint}?${encodedOptions.join('&')}`;
    }

    return endpoint;
  }

  /** Returns the envelope endpoint URL. */
  private _getEnvelopeEndpoint(): string {
    return this._getIngestEndpoint('envelope');
  }

  /** Returns the ingest API endpoint for target. */
  private _getIngestEndpoint(target: 'store' | 'envelope'): string {
    if (this._envelopeTunnel) {
      return this._envelopeTunnel;
    }
    const base = this.getBaseApiEndpoint();
    const dsn = this.getDsn();
    return `${base}${dsn.projectId}/${target}/`;
  }

  /** Returns a URL-encoded string with auth config suitable for a query string. */
  private _encodedAuth(): string {
    const dsn = this.getDsn();
    const auth = {
      // We send only the minimum set of required information. See
      // https://github.com/getsentry/sentry-javascript/issues/2572.
      sentry_key: dsn.publicKey,
      sentry_version: SENTRY_API_VERSION,
    };
    return urlEncode(auth);
  }
}
