import type { Integration, Options } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrationsWithoutPerformance, init as initNode } from '@sentry/node';
import { gcpContextIntegration } from './integrations/gcp-context';
import { googleCloudGrpcIntegration } from './integrations/google-cloud-grpc';
import { googleCloudHttpIntegration } from './integrations/google-cloud-http';

function getCjsOnlyIntegrations(): Integration[] {
  /*! rollup-include-cjs-only */
  return [
    googleCloudHttpIntegration({ optional: true }), // We mark this integration optional since '@google-cloud/common' module could be missing.
    googleCloudGrpcIntegration({ optional: true }), // We mark this integration optional since 'google-gax' module could be missing.
  ];
  /*! rollup-include-cjs-only-end */
  /*! rollup-include-esm-only */
  return [];
  /*! rollup-include-esm-only-end */
}

/** Get the default integrations for the GCP SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  return [...getDefaultIntegrationsWithoutPerformance(), gcpContextIntegration(), ...getCjsOnlyIntegrations()];
}

/**
 * @see {@link Sentry.init}
 */
export function init(options: NodeOptions = {}): NodeClient | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'google-cloud-serverless', ['google-cloud-serverless', 'node']);

  return initNode(opts);
}
