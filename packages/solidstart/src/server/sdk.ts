import { URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { _INTERNAL_captureOptionsSetByUser, applySdkMetadata, escapeStringForRegex } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';
import { getBasePath } from '../common/tunnel';

/**
 * Initializes the server side of the Solid Start SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ..._INTERNAL_captureOptionsSetByUser(options),
    ignoreSpans: [...(options.ignoreSpans || []), getBuildAssetRequestFilter()],
  };

  applySdkMetadata(opts, 'solidstart', ['solidstart', 'node']);

  return initNodeSdk(opts);
}

/**
 * SolidStart serves its client build under `<base path>/_build/`. Matches `url.path`, because a span name has no path
 * yet when `ignoreSpans` runs.
 */
function getBuildAssetRequestFilter(): NonNullable<NodeOptions['ignoreSpans']>[number] {
  const basePath = getBasePath();
  // A full URL as the base (a CDN) is not part of the request path.
  const pathPrefix = basePath.includes('://') ? '' : basePath;
  return { op: HTTP_SERVER, attributes: { [URL_PATH]: new RegExp(`^${escapeStringForRegex(pathPrefix)}/_build/`) } };
}
