import type { ReportDialogOptions } from './report-dialog';
import type { DsnComponents, DsnLike } from './types-hoist/dsn';
import type { SdkInfo } from './types-hoist/sdkinfo';
import { dsnToString, makeDsn } from './utils/dsn';

const SENTRY_API_VERSION = '7';

/** Returns the prefix to construct Sentry ingestion API endpoints. */
function getBaseApiEndpoint(dsn: DsnComponents): string {
  const protocol = dsn.protocol ? `${dsn.protocol}:` : '';
  const port = dsn.port ? `:${dsn.port}` : '';
  return `${protocol}//${dsn.host}${port}${dsn.path ? `/${dsn.path}` : ''}/api/`;
}

/** Returns the ingest API endpoint for target. */
function _getIngestEndpoint(dsn: DsnComponents): string {
  return `${getBaseApiEndpoint(dsn)}${dsn.projectId}/envelope/`;
}

/** Returns a URL-encoded string with auth config suitable for a query string. */
function _encodedAuth(dsn: DsnComponents, sdkInfo: SdkInfo | undefined): string {
  const params: Record<string, string> = {
    sentry_version: SENTRY_API_VERSION,
  };

  if (dsn.publicKey) {
    // We send only the minimum set of required information. See
    // https://github.com/getsentry/sentry-javascript/issues/2572.
    params.sentry_key = dsn.publicKey;
  }

  if (sdkInfo) {
    params.sentry_client = `${sdkInfo.name}/${sdkInfo.version}`;
  }

  return new URLSearchParams(params).toString();
}

/**
 * Returns the envelope endpoint URL with auth in the query string.
 *
 * Sending auth as part of the query string and not as custom HTTP headers avoids CORS preflight requests.
 */
export function getEnvelopeEndpointWithUrlEncodedAuth(dsn: DsnComponents, tunnel?: string, sdkInfo?: SdkInfo): string {
  return tunnel ? tunnel : `${_getIngestEndpoint(dsn)}?${_encodedAuth(dsn, sdkInfo)}`;
}

/** Returns the url to the report dialog endpoint. */
export function getReportDialogEndpoint(dsnLike: DsnLike, dialogOptions: ReportDialogOptions): string {
  const dsn = makeDsn(dsnLike);
  if (!dsn) {
    return '';
  }

  const endpoint = `${getBaseApiEndpoint(dsn)}embed/error-page/`;

  let encodedOptions = `dsn=${dsnToString(dsn)}`;
  for (const key in dialogOptions) {
    if (key === 'dsn') {
      continue;
    }

    if (key === 'onClose') {
      continue;
    }

    if (key === 'user') {
      const user = dialogOptions.user;
      if (!user) {
        continue;
      }
      if (user.name) {
        encodedOptions += `&name=${encodeURIComponent(user.name)}`;
      }
      if (user.email) {
        encodedOptions += `&email=${encodeURIComponent(user.email)}`;
      }
    } else {
      encodedOptions += `&${encodeURIComponent(key)}=${encodeURIComponent(dialogOptions[key] as string)}`;
    }
  }

  return `${endpoint}?${encodedOptions}`;
}
