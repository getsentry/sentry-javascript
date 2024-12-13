type PartialURL = {
  host?: string;
  path?: string;
  protocol?: string;
  relative?: string;
  search?: string;
  hash?: string;
};

/**
 * Parses string form of URL into an object
 * // borrowed from https://tools.ietf.org/html/rfc3986#appendix-B
 * // intentionally using regex and not <a/> href parsing trick because React Native and other
 * // environments where DOM might not be available
 * @returns parsed URL object
 */
export function parseUrl(url: string): PartialURL {
  if (!url) {
    return {};
  }

  const match = url.match(/^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/);

  if (!match) {
    return {};
  }

  // coerce to undefined values to empty string so we don't get 'undefined'
  const query = match[6] || '';
  const fragment = match[8] || '';
  return {
    host: match[4],
    path: match[5],
    protocol: match[2],
    search: query,
    hash: fragment,
    relative: match[5] + query + fragment, // everything minus origin
  };
}

/**
 * Strip the query string and fragment off of a given URL or path (if present)
 *
 * @param urlPath Full URL or path, including possible query string and/or fragment
 * @returns URL or path without query string or fragment
 */
export function stripUrlQueryAndFragment(urlPath: string): string {
  return (urlPath.split(/[?#]/, 1) as [string, ...string[]])[0];
}

/**
 * Returns number of URL segments of a passed string URL.
 *
 * @deprecated This function will be removed in the next major version.
 */
// TODO(v9): Hoist this function into the places where we use it. (as it stands only react router v6 instrumentation)
export function getNumberOfUrlSegments(url: string): number {
  // split at '/' or at '\/' to split regex urls correctly
  return url.split(/\\?\//).filter(s => s.length > 0 && s !== ',').length;
}

/**
 * Takes a URL object and returns a sanitized string which is safe to use as span name
 * see: https://develop.sentry.dev/sdk/data-handling/#structuring-data
 */
export function getSanitizedUrlString(url: PartialURL): string {
  const { protocol, host, path } = url;

  const filteredHost =
    (host &&
      host
        // Always filter out authority
        .replace(/^.*@/, '[filtered]:[filtered]@')
        // Don't show standard :80 (http) and :443 (https) ports to reduce the noise
        // TODO: Use new URL global if it exists
        .replace(/(:80)$/, '')
        .replace(/(:443)$/, '')) ||
    '';

  return `${protocol ? `${protocol}://` : ''}${filteredHost}${path}`;
}
