import type { Integration, Options } from '@sentry/core';
import { applySdkMetadata, debug, getSDKSource } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrationsWithoutPerformance, initWithoutDefaultIntegrations } from '@sentry/node';
import { DEBUG_BUILD } from './debug-build';
import { awsIntegration } from './integration/aws';
import { awsLambdaIntegration } from './integration/awslambda';

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
export function getDefaultIntegrations(options: Options): Integration[] {
  return [...getDefaultIntegrationsWithoutPerformance(options), awsIntegration(), awsLambdaIntegration()];
}

export interface AwsServerlessOptions extends NodeOptions {
  /**
   * If Sentry events should be proxied through the Lambda extension when using the Lambda layer. Defaults to `true` when using the Lambda layer.
   */
  useLayerExtension?: boolean;
}

/**
 * Initializes the Sentry AWS Lambda SDK.
 *
 * @param options Configuration options for the SDK, @see {@link AWSLambdaOptions}.
 */
export function init(options: AwsServerlessOptions = {}): NodeClient | undefined {
  const sdkSource = getSDKSource();
  const proxyWouldInterfere = shouldDisableLayerExtensionForProxy();

  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    useLayerExtension: sdkSource === 'aws-lambda-layer' && !options.tunnel && !proxyWouldInterfere,
    ...options,
  };

  if (opts.useLayerExtension) {
    if (sdkSource === 'aws-lambda-layer') {
      if (!opts.tunnel) {
        DEBUG_BUILD && debug.log('Proxying Sentry events through the Sentry Lambda extension');
        opts.tunnel = 'http://localhost:9000/envelope';
      } else {
        DEBUG_BUILD &&
          debug.warn(
            `Using a custom tunnel with the Sentry Lambda extension is not supported. Events will be tunnelled to ${opts.tunnel} and not through the extension.`,
          );
      }
    } else {
      DEBUG_BUILD && debug.warn('The Sentry Lambda extension is only supported when using the AWS Lambda layer.');
    }
  } else if (sdkSource === 'aws-lambda-layer' && proxyWouldInterfere) {
    DEBUG_BUILD &&
      debug.warn(
        'Sentry Lambda extension disabled due to proxy environment variables (http_proxy/https_proxy). Consider adding localhost to no_proxy to re-enable.',
      );
  }

  applySdkMetadata(opts, 'aws-serverless', ['aws-serverless'], sdkSource);

  return initWithoutDefaultIntegrations(opts);
}
