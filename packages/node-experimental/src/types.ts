import type { Tracer } from '@opentelemetry/api';
import type { NodeClient, NodeOptions } from '@sentry/node';
import type { Breadcrumb, Transaction } from '@sentry/types';

export type NodeExperimentalOptions = NodeOptions;
export type NodeExperimentalClientOptions = ConstructorParameters<typeof NodeClient>[0];

export interface NodeExperimentalClient extends NodeClient {
  tracer: Tracer;
  getOptions(): NodeExperimentalClientOptions;
}

/**
 * This is a fork of the base Transaction with OTEL specific stuff added.
 * Note that we do not solve this via an actual subclass, but by wrapping this in a proxy when we need it -
 * as we can't easily control all the places a transaction may be created.
 */
export interface TransactionWithBreadcrumbs extends Transaction {
  _breadcrumbs: Breadcrumb[];

  /** Get all breadcrumbs added to this transaction. */
  getBreadcrumbs(): Breadcrumb[];

  /** Add a breadcrumb to this transaction. */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void;
}
