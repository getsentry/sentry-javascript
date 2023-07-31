import type { NodeClient, NodeOptions } from '@sentry/node';

export type NodeExperimentalOptions = NodeOptions;
export type NodeExperimentalClientOptions = ConstructorParameters<typeof NodeClient>[0];
