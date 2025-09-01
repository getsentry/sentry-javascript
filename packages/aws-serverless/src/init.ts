import type { Integration, Options } from '@sentry/core';
import { applySdkMetadata, debug, getSDKSource } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrationsWithoutPerformance, initWithoutDefaultIntegrations } from '@sentry/node';
import { DEBUG_BUILD } from './debug-build';
import { awsIntegration } from './integration/aws';
import { awsLambdaIntegration } from './integration/awslambda';
/**
 * Get the default integrations for the AWSLambda SDK.
 */
// NOTE: in awslambda-auto.ts, we also call the original `getDefaultIntegrations` from `@sentry/node` to load performance integrations.
// If at some point we need to filter a node integration out for good, we need to make sure to also filter it out there.
export function getDefaultIntegrations(_options: Options): Integration[] {
  return [...getDefaultIntegrationsWithoutPerformance(), awsIntegration(), awsLambdaIntegration()];
}

export interface AwsServerlessOptions extends NodeOptions {
  _experiments?: NodeOptions['_experiments'] & {
    /**
     * If proxying Sentry events through the Sentry Lambda extension should be enabled.
     */
    enableLambdaExtension?: boolean;
  };
}

/**
 * Initializes the Sentry AWS Lambda SDK.
 *
 * @param options Configuration options for the SDK, @see {@link AWSLambdaOptions}.
 */
export function init(options: AwsServerlessOptions = {}): NodeClient | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  const sdkSource = getSDKSource();

  if (opts._experiments?.enableLambdaExtension && sdkSource === 'aws-lambda-layer' && !opts.tunnel) {
    DEBUG_BUILD && debug.log('Proxying Sentry events through the Sentry Lambda extension');
    opts.tunnel = 'http://localhost:9000/envelope';
  }

  applySdkMetadata(opts, 'aws-serverless', ['aws-serverless'], sdkSource);

  return initWithoutDefaultIntegrations(opts);
}
