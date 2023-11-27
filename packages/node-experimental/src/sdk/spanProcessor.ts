import { SpanKind } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { getClient, SentrySpanProcessor } from '@sentry/opentelemetry';

import { Http } from '../integrations/http';
import { NodeFetch } from '../integrations/node-fetch';
import type { NodeExperimentalClient } from '../types';

/**
 * Implement custom code to avoid sending spans in certain cases.
 */
export class NodeExperimentalSentrySpanProcessor extends SentrySpanProcessor {
  /** @inheritDoc */
  protected _shouldSendSpanToSentry(span: Span): boolean {
    const client = getClient<NodeExperimentalClient>();
    const httpIntegration = client ? client.getIntegration(Http) : undefined;
    const fetchIntegration = client ? client.getIntegration(NodeFetch) : undefined;

    // If we encounter a client or server span with url & method, we assume this comes from the http instrumentation
    // In this case, if `shouldCreateSpansForRequests` is false, we want to _record_ the span but not _sample_ it,
    // So we can generate a breadcrumb for it but no span will be sent
    if (
      httpIntegration &&
      (span.kind === SpanKind.CLIENT || span.kind === SpanKind.SERVER) &&
      span.attributes[SemanticAttributes.HTTP_URL] &&
      span.attributes[SemanticAttributes.HTTP_METHOD]
    ) {
      const shouldCreateSpansForRequests =
        span.attributes['http.client'] === 'fetch'
          ? fetchIntegration?.shouldCreateSpansForRequests
          : httpIntegration?.shouldCreateSpansForRequests;

      return shouldCreateSpansForRequests !== false;
    }

    return true;
  }
}
