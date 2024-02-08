import { SpanKind } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SentrySpanProcessor, getClient } from '@sentry/opentelemetry';

import type { Http } from '../integrations/http';
import type { NodeFetch } from '../integrations/node-fetch';
import type { NodeExperimentalClient } from '../types';
import { Scope } from './scope';

/**
 * Implement custom code to avoid sending spans in certain cases.
 */
export class NodeExperimentalSentrySpanProcessor extends SentrySpanProcessor {
  public constructor() {
    super({ scopeClass: Scope });
  }

  /** @inheritDoc */
  protected _shouldSendSpanToSentry(span: Span): boolean {
    const client = getClient<NodeExperimentalClient>();
    // eslint-disable-next-line deprecation/deprecation
    const httpIntegration = client ? client.getIntegrationByName<Http>('Http') : undefined;
    // eslint-disable-next-line deprecation/deprecation
    const fetchIntegration = client ? client.getIntegrationByName<NodeFetch>('NodeFetch') : undefined;

    // If we encounter a client or server span with url & method, we assume this comes from the http instrumentation
    // In this case, if `shouldCreateSpansForRequests` is false, we want to _record_ the span but not _sample_ it,
    // So we can generate a breadcrumb for it but no span will be sent
    // TODO v8: Remove this
    if (
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
