import { HTTP_REQUEST_METHOD, URL_PATH } from '@sentry/conventions/attributes';
import { FUNCTION_AWS } from '@sentry/conventions/op';
import type { Integration, Options } from '@sentry/core';
import { applySdkMetadata, debug, envToBool, getSDKSource } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrationsWithoutPerformance, initWithoutDefaultIntegrations } from '@sentry/node';
import { awsIntegration } from '@sentry/server-utils';
import { DEBUG_BUILD } from './debug-build';
import { awsLambdaIntegration } from './integration/awslambda';

// Invocations `http.server` spans skip by default: CORS preflights and HEAD requests always, and GET requests for
// static assets (see `isStaticAssetRequest` in `@sentry/core`) unless `ignoreStaticAssets` is `false`.
const PREFLIGHT_AND_HEAD_INVOCATIONS: NonNullable<Options['ignoreSpans']> = [
  { op: FUNCTION_AWS, attributes: { [HTTP_REQUEST_METHOD]: /^(OPTIONS|HEAD)$/ } },
];

const STATIC_ASSET_INVOCATIONS: NonNullable<Options['ignoreSpans']> = [
  {
    op: FUNCTION_AWS,
    attributes: {
      [HTTP_REQUEST_METHOD]: /^GET$/,
      [URL_PATH]:
        /(\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot|webp|avif)|^\/(robots\.txt|sitemap\.xml|manifest\.json|browserconfig\.xml))$/,
    },
  },
];

/**
 * Checks if proxy environment variables would interfere with the layer extension.
 * The layer extension uses localhost:9000, so we need to check if proxy settings would prevent this.
 */
function shouldDisableLayerExtensionForProxy(): boolean {
  const { http_proxy, no_proxy } = process.env;

  // If no http proxy is configured, no interference (https_proxy doesn't affect HTTP requests)
  if (!http_proxy) {
    return false;
  }

  // Check if localhost is exempted by no_proxy
  if (no_proxy) {
    const exemptions = no_proxy.split(',').map(exemption => exemption.trim().toLowerCase());

    // Handle common localhost exemption patterns explicitly
    // If localhost is exempted, requests to the layer extension will not be proxied
    const localhostExemptions = ['*', 'localhost', '127.0.0.1', '::1'];
    if (exemptions.some(exemption => localhostExemptions.includes(exemption))) {
      return false;
    }
  }

  // If http_proxy is set and no localhost exemption, it would interfere
  // The layer extension uses HTTP to localhost:9000, so only http_proxy matters
  if (http_proxy) {
    DEBUG_BUILD &&
      debug.log(
        'Disabling useLayerExtension due to http_proxy environment variable. Consider adding localhost to no_proxy to re-enable.',
      );
    return true;
  }

  return false;
}

/**
 * Get the default integrations for the AWSLambda SDK.
 */
// NOTE: in awslambda-auto.ts, we also call the original `getDefaultIntegrations` from `@sentry/node` to load performance integrations.
// If at some point we need to filter a node integration out for good, we need to make sure to also filter it out there.
export function getDefaultIntegrations(_options: Options): Integration[] {
  return [...getDefaultIntegrationsWithoutPerformance(), awsIntegration(), awsLambdaIntegration()];
}

export interface AwsServerlessOptions extends NodeOptions {
  /**
   * If Sentry events should be proxied through the Lambda extension when using the Lambda layer.
   * Defaults to `true` when using the Lambda layer.
   *
   * Can also be configured via the `SENTRY_LAYER_EXTENSION` environment variable.
   */
  useLayerExtension?: boolean;

  /**
   * Whether to skip spans for GET invocations of common static assets (favicon.ico, robots.txt, `.js`, images, etc.).
   * CORS preflight (`OPTIONS`) and `HEAD` invocations are always skipped.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;
}

/**
 * The `ignoreSpans` the SDK is initialized with: the user's own entries plus the default HTTP invocation filters.
 */
export function getIgnoreSpans(options: AwsServerlessOptions): NonNullable<Options['ignoreSpans']> {
  return [
    ...(options.ignoreSpans || []),
    ...PREFLIGHT_AND_HEAD_INVOCATIONS,
    ...(options.ignoreStaticAssets === false ? [] : STATIC_ASSET_INVOCATIONS),
  ];
}

/**
 * Initializes the Sentry AWS Lambda SDK.
 *
 * @param options Configuration options for the SDK, @see {@link AWSLambdaOptions}.
 */
export function init(options: AwsServerlessOptions = {}): NodeClient | undefined {
  const sdkSource = getSDKSource();
  const proxyWouldInterfere = shouldDisableLayerExtensionForProxy();

  // Determine useLayerExtension value with the following priority:
  // 1. Explicit option value (if provided)
  // 2. Environment variable SENTRY_LAYER_EXTENSION (if set)
  // 3. Default logic based on sdkSource, tunnel, and proxy settings
  const useLayerExtensionFromEnv = envToBool(process.env.SENTRY_LAYER_EXTENSION, { strict: true });
  const defaultUseLayerExtension = sdkSource === 'aws-lambda-layer' && !options.tunnel && !proxyWouldInterfere;
  const useLayerExtension = options.useLayerExtension ?? useLayerExtensionFromEnv ?? defaultUseLayerExtension;

  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    useLayerExtension,
    ...options,
    ignoreSpans: getIgnoreSpans(options),
  };

  if (opts.useLayerExtension) {
    if (sdkSource !== 'aws-lambda-layer') {
      DEBUG_BUILD && debug.warn('The Sentry Lambda extension is only supported when using the AWS Lambda layer.');
    } else if (opts.tunnel || proxyWouldInterfere) {
      if (opts.tunnel) {
        DEBUG_BUILD &&
          debug.warn(
            `Using a custom tunnel with the Sentry Lambda extension is not supported. Events will be tunnelled to ${opts.tunnel} and not through the extension.`,
          );
      }

      if (proxyWouldInterfere) {
        DEBUG_BUILD &&
          debug.warn(
            'Sentry Lambda extension is disabled due to proxy environment variables (http_proxy/https_proxy). Consider adding localhost to no_proxy to re-enable.',
          );
      }
    } else {
      DEBUG_BUILD && debug.log('Proxying Sentry events through the Sentry Lambda extension');
      opts.tunnel = 'http://localhost:9000/envelope';
    }
  }

  applySdkMetadata(opts, 'aws-serverless', ['aws-serverless', 'node'], sdkSource);

  return initWithoutDefaultIntegrations(opts);
}
