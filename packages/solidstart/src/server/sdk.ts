import { URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { _INTERNAL_captureOptionsSetByUser, applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';

/**
 * SolidStart serves its client build under `/_build/`. Matches `url.path`, because a span name has no path yet when
 * `ignoreSpans` runs.
 */
const BUILD_ASSET_REQUEST_FILTER = { op: HTTP_SERVER, attributes: { [URL_PATH]: /^\/_build\// } };

/**
 * Initializes the server side of the Solid Start SDK
 */
export function init(options: NodeOptions): NodeClient | undefined {
  const opts = {
    ..._INTERNAL_captureOptionsSetByUser(options),
    ignoreSpans: [...(options.ignoreSpans || []), BUILD_ASSET_REQUEST_FILTER],
  };

  applySdkMetadata(opts, 'solidstart', ['solidstart', 'node']);

  return initNodeSdk(opts);
}
