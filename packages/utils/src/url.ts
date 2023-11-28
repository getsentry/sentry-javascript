type PartialURL = Partial<{
  host: string;
  path: string;
  protocol: string;
  relative: string;
  search: string;
  hash: string;
  urlInstance: URL;
}>;

const urlRegex = /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/;

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

  // Node.js v10 and above supports WHATWG URL API. We can use it when available.
  // TODO(@anonrig): Remove this check when we drop support for Node v10.
  if (typeof URL !== undefined) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;

      return {
        host: parsed.host,
        // WHATWG URL API includes the leading slash in the pathname
        // Example: Returns `/` for `https://sentry.io`
        path: pathname.length === 1 ? '' : pathname,
        // WHATWG URL API includes the trailing colon in the protocol
        // Example: Returns `https:` for `https://sentry.io`
        protocol: parsed.protocol.slice(0, -1),
        search: parsed.search,
        hash: parsed.hash,
        relative: parsed.pathname + parsed.search + parsed.hash,
        urlInstance: parsed,
      };
    } catch {
      // If URL is invalid, fallback to regex parsing to support URLs without protocols.
    }
  }

  const match = url.match(urlRegex);

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
  // eslint-disable-next-line no-useless-escape
  return urlPath.split(/[\?#]/, 1)[0];
}

/**
 * Returns number of URL segments of a passed string URL.
 */
export function getNumberOfUrlSegments(url: string): number {
  // split at '/' or at '\/' to split regex urls correctly
  return url.split(/\\?\//).filter(s => s.length > 0 && s !== ',').length;
}

/**
 * Takes a URL object and returns a sanitized string which is safe to use as span description
 * see: https://develop.sentry.dev/sdk/data-handling/#structuring-data
 */
export function getSanitizedUrlString(url: PartialURL): string {
  const { protocol, host, path, urlInstance } = url;

  // This means that the environment supports WHATWG URL API.
  // This case will not be executed if URL does not have a protocol
  // since WHATWG URL specification requires protocol to be present.
  if (urlInstance !== undefined) {
    const { port, username, password, hostname, pathname, protocol } = urlInstance;
    const hasAuthority = username.length > 0 || password.length > 0;
    let output = `${protocol}//`;

    if (hasAuthority) {
      if (username) {
        output += '[filtered]';
      }

      output += ':';

      if (password) {
        output += '[filtered]';
      }

      output += '@';
    }

    output += hostname;

    if (port && port !== '80' && port !== '443') {
      output += `:${port}`;
    }

    // Do not append pathname if it is empty.
    // For example: Pathname is `/` for `https://sentry.io`
    if (pathname.length > 1) {
      output += pathname;
    }

    return output;
  }

  const filteredHost =
    (host &&
      host
        // Always filter out authority
        .replace(/^.*@/, '[filtered]:[filtered]@')
        // Don't show standard :80 (http) and :443 (https) ports to reduce the noise
        .replace(/(:80)$/, '')
        .replace(/(:443)$/, '')) ||
    '';

  return `${protocol ? `${protocol}://` : ''}${filteredHost}${path}`;
}
