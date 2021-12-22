import { DsnComponents, DsnLike, SdkMetadata } from '@sentry/types';
import { dsnToString, makeDsn, urlEncode } from '@sentry/utils';

const SENTRY_API_VERSION = '7';

/**
 * Stores details about a Sentry SDK
 */
export interface APIDetails {
  /** The DSN as passed to Sentry.init() */
  initDsn: DsnLike;
  /** Metadata about the SDK (name, version, etc) for inclusion in envelope headers */
  metadata: SdkMetadata;
  /** The internally used Dsn object. */
  readonly dsn: DsnComponents;
  /** The envelope tunnel to use. */
  readonly tunnel?: string;
}

/**
 * Helper class to provide urls, headers and metadata that can be used to form
 * different types of requests to Sentry endpoints.
 * Supports both envelopes and regular event requests.
 *
 * @deprecated Please use APIDetails
 **/
export class API {
  /** The DSN as passed to Sentry.init() */
  public dsn: DsnLike;

  /** Metadata about the SDK (name, version, etc) for inclusion in envelope headers */
  public metadata: SdkMetadata;

  /** The internally used Dsn object. */
  private readonly _dsnObject: DsnComponents;

  /** The envelope tunnel to use. */
  private readonly _tunnel?: string;

  /** Create a new instance of API */
  public constructor(dsn: DsnLike, metadata: SdkMetadata = {}, tunnel?: string) {
    this.dsn = dsn;
    this._dsnObject = makeDsn(dsn);
    this.metadata = metadata;
    this._tunnel = tunnel;
  }

  /** Returns the Dsn object. */
  public getDsn(): DsnComponents {
    return this._dsnObject;
  }

  /** Does this transport force envelopes? */
  public forceEnvelope(): boolean {
    return !!this._tunnel;
  }

  /** Returns the prefix to construct Sentry ingestion API endpoints. */
  public getBaseApiEndpoint(): string {
    return getBaseApiEndpoint(this._dsnObject);
  }

  /** Returns the store endpoint URL. */
  public getStoreEndpoint(): string {
    return getStoreEndpoint(this._dsnObject);
  }

  /**
   * Returns the store endpoint URL with auth in the query string.
   *
   * Sending auth as part of the query string and not as custom HTTP headers avoids CORS preflight requests.
   */
  public getStoreEndpointWithUrlEncodedAuth(): string {
    return getStoreEndpointWithUrlEncodedAuth(this._dsnObject);
  }

  /**
   * Returns the envelope endpoint URL with auth in the query string.
   *
   * Sending auth as part of the query string and not as custom HTTP headers avoids CORS preflight requests.
   */
  public getEnvelopeEndpointWithUrlEncodedAuth(): string {
    return getEnvelopeEndpointWithUrlEncodedAuth(this._dsnObject, this._tunnel);
  }
}

/** Initializes API Details */
export function initAPIDetails(dsn: DsnLike, metadata?: SdkMetadata, tunnel?: string): APIDetails {
  return {
    initDsn: dsn,
    metadata: metadata || {},
    dsn: makeDsn(dsn),
    tunnel,
  } as APIDetails;
}

/** Returns the prefix to construct Sentry ingestion API endpoints. */
function getBaseApiEndpoint(dsn: DsnComponents): string {
  const protocol = dsn.protocol ? `${dsn.protocol}:` : '';
  const port = dsn.port ? `:${dsn.port}` : '';
  return `${protocol}//${dsn.host}${port}${dsn.path ? `/${dsn.path}` : ''}/api/`;
}

/** Returns the ingest API endpoint for target. */
function _getIngestEndpoint(dsn: DsnComponents, target: 'store' | 'envelope'): string {
  return `${getBaseApiEndpoint(dsn)}${dsn.projectId}/${target}/`;
}

/** Returns a URL-encoded string with auth config suitable for a query string. */
function _encodedAuth(dsn: DsnComponents): string {
  return urlEncode({
    // We send only the minimum set of required information. See
    // https://github.com/getsentry/sentry-javascript/issues/2572.
    sentry_key: dsn.publicKey,
    sentry_version: SENTRY_API_VERSION,
  });
}

/** Returns the store endpoint URL. */
function getStoreEndpoint(dsn: DsnComponents): string {
  return _getIngestEndpoint(dsn, 'store');
}

/**
 * Returns the store endpoint URL with auth in the query string.
 *
 * Sending auth as part of the query string and not as custom HTTP headers avoids CORS preflight requests.
 */
export function getStoreEndpointWithUrlEncodedAuth(dsn: DsnComponents): string {
  return `${getStoreEndpoint(dsn)}?${_encodedAuth(dsn)}`;
}

/** Returns the envelope endpoint URL. */
function _getEnvelopeEndpoint(dsn: DsnComponents): string {
  return _getIngestEndpoint(dsn, 'envelope');
}

/**
 * Returns the envelope endpoint URL with auth in the query string.
 *
 * Sending auth as part of the query string and not as custom HTTP headers avoids CORS preflight requests.
 */
export function getEnvelopeEndpointWithUrlEncodedAuth(dsn: DsnComponents, tunnel?: string): string {
  return tunnel ? tunnel : `${_getEnvelopeEndpoint(dsn)}?${_encodedAuth(dsn)}`;
}

/**
 * Returns an object that can be used in request headers.
 * This is needed for node and the old /store endpoint in sentry
 */
export function getRequestHeaders(
  dsn: DsnComponents,
  clientName: string,
  clientVersion: string,
): { [key: string]: string } {
  // CHANGE THIS to use metadata but keep clientName and clientVersion compatible
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
export function getReportDialogEndpoint(
  dsnLike: DsnLike,
  dialogOptions: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
    user?: { name?: string; email?: string };
  },
): string {
  const dsn = makeDsn(dsnLike);
  const endpoint = `${getBaseApiEndpoint(dsn)}embed/error-page/`;

  let encodedOptions = `dsn=${dsnToString(dsn)}`;
  for (const key in dialogOptions) {
    if (key === 'dsn') {
      continue;
    }

    if (key === 'user') {
      if (!dialogOptions.user) {
        continue;
      }
      if (dialogOptions.user.name) {
        encodedOptions += `&name=${encodeURIComponent(dialogOptions.user.name)}`;
      }
      if (dialogOptions.user.email) {
        encodedOptions += `&email=${encodeURIComponent(dialogOptions.user.email)}`;
      }
    } else {
      encodedOptions += `&${encodeURIComponent(key)}=${encodeURIComponent(dialogOptions[key] as string)}`;
    }
  }

  return `${endpoint}?${encodedOptions}`;
}
