import type { NodeClient, NodeOptions } from '@sentry/node';

export type NodePreviewOptions = NodeOptions;
export type NodePreviewClientOptions = ConstructorParameters<typeof NodeClient>[0];
