import type { Integration } from '@sentry/core';
import {
  applySdkMetadata,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';
import type { NodeClient, NodeOptions, Span } from '@sentry/node';
import { getDefaultIntegrations as getDefaultNodeIntegrations, init as nodeInit } from '@sentry/node';
import { nestIntegration } from './integrations/nest';

/**
 * Initializes the NestJS SDK
 */
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  const opts: NodeOptions = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'nestjs');

  const client = nodeInit(opts);

  if (client) {
    client.on('spanStart', span => {
      // The NestInstrumentation has no requestHook, so we add NestJS-specific attributes here
      addNestSpanAttributes(span);
    });
  }

  return client;
}

/** Get the default integrations for the NestJS SDK. */
export function getDefaultIntegrations(options: NodeOptions): Integration[] | undefined {
  return [nestIntegration(), ...getDefaultNodeIntegrations(options)];
}

function addNestSpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data;

  // this is one of: app_creation, request_context, handler
  const type = attributes['nestjs.type'];

  // Only set the NestJS attributes for spans that are created by the NestJS instrumentation and for spans that do not have an op already.
  if (type && !attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]) {
    span.setAttributes({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.nestjs',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.nestjs`,
    });
  }
}
