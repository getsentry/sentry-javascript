import type { ClientOptions, DsnComponents, DsnLike, SdkInfo } from '@sentry/types';
import { dsnToString, makeDsn, urlEncode } from '@sentry/utils';

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
  return urlEncode({
    // We send only the minimum set of required information. See
    // https://github.com/getsentry/sentry-javascript/issues/2572.
    sentry_key: dsn.publicKey,
    sentry_version: SENTRY_API_VERSION,
    ...(sdkInfo && { sentry_client: `${sdkInfo.name}/${sdkInfo.version}` }),
  });
}

/**
 * Returns the envelope endpoint URL with auth in the query string.
 *
 * Sending auth as part of the query string and not as custom HTTP headers avoids CORS preflight requests.
 */
export function getEnvelopeEndpointWithUrlEncodedAuth(
  dsn: DsnComponents,
  // TODO (v8): Remove `tunnelOrOptions` in favor of `options`, and use the substitute code below
  // options: ClientOptions = {} as ClientOptions,
  tunnelOrOptions: string | ClientOptions = {} as ClientOptions,
): string {
  // TODO (v8): Use this code instead
  // const { tunnel, _metadata = {} } = options;
  // return tunnel ? tunnel : `${_getIngestEndpoint(dsn)}?${_encodedAuth(dsn, _metadata.sdk)}`;

  const tunnel = typeof tunnelOrOptions === 'string' ? tunnelOrOptions : tunnelOrOptions.tunnel;
  const sdkInfo =
    typeof tunnelOrOptions === 'string' || !tunnelOrOptions._metadata ? undefined : tunnelOrOptions._metadata.sdk;

  return tunnel ? tunnel : `${_getIngestEndpoint(dsn)}?${_encodedAuth(dsn, sdkInfo)}`;
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
