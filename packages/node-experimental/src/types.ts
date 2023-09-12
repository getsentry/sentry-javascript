import type { Tracer } from '@opentelemetry/api';
import type { NodeClient, NodeOptions } from '@sentry/node';

export type NodeExperimentalOptions = NodeOptions;
export type NodeExperimentalClientOptions = ConstructorParameters<typeof NodeClient>[0];

export interface NodeExperimentalClient extends NodeClient {
  tracer: Tracer;
  getOptions(): NodeExperimentalClientOptions;
}
