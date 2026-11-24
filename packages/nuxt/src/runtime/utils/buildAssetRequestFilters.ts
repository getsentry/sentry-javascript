import { URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import type { Options } from '@sentry/core';
import { escapeStringForRegex } from '@sentry/core';

/**
 * Returns the `ignoreSpans` entries for requests to `buildAssetsPath` (`app.baseURL` + `app.buildAssetsDir`), the
 * build output that the static asset filters miss, such as `.map` and `.json` files. Matches `url.path`, because a
 * span name has no path yet when `ignoreSpans` runs. A runtime `NUXT_APP_BASE_URL` disables this filter, because the
 * path comes from build-time config.
 */
export function getBuildAssetRequestFilters(buildAssetsPath: string | undefined): NonNullable<Options['ignoreSpans']> {
  return buildAssetsPath
    ? [{ op: HTTP_SERVER, attributes: { [URL_PATH]: new RegExp(`^${escapeStringForRegex(buildAssetsPath)}`) } }]
    : [];
}
