const VINEXT_QUERY_PARAM_PREFIX = '__vinext_';
const VINEXT_HEADER_PREFIX = 'x-vinext-internal-';

/**
 * vinext's Workers Cache CDN adapter renders a page in a second invocation, through `ctx.exports`. Its request carries
 * vinext's transport data: `__vinext_*` query parameters and `x-vinext-internal-*` headers, which hold the original
 * URL, `request.cf` and the `Authorization` value. vinext removes them before the app gets the request, so the SDK
 * has to remove them before it records the request too.
 *
 * Returns the request to record. The handler still gets the original request.
 */
export function stripVinextInternalRequestData(request: Request): Request {
  const headers = new Headers();
  let hasInternalData = request.url.includes(VINEXT_QUERY_PARAM_PREFIX);
  // `Headers` lists names in lowercase.
  request.headers.forEach((value, name) => {
    if (name.startsWith(VINEXT_HEADER_PREFIX)) {
      hasInternalData = true;
    } else {
      headers.append(name, value);
    }
  });

  if (!hasInternalData) {
    return request;
  }

  const url = new URL(request.url);
  url.search = url.search
    .slice(1)
    .split('&')
    .filter(part => !part.startsWith(VINEXT_QUERY_PARAM_PREFIX))
    .join('&');
  // No body: vinext sends none on this request, and reading the original's here would consume it before the handler.
  return new Request(url, { method: request.method, headers });
}
