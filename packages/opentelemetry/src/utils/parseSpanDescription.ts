import type { AttributeValue, Attributes } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_ROUTE,
  ATTR_URL_FULL,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_FAAS_TRIGGER,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_TARGET,
  SEMATTRS_HTTP_URL,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_RPC_SERVICE,
} from '@opentelemetry/semantic-conventions';
import type { SpanAttributes, TransactionSource } from '@sentry/types';
import { getSanitizedUrlString, parseUrl, stripUrlQueryAndFragment } from '@sentry/utils';

import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION } from '../semanticAttributes';
import type { AbstractSpan } from '../types';
import { getSpanKind } from './getSpanKind';
import { spanHasAttributes, spanHasName } from './spanTypes';

interface SpanDescription {
  op: string | undefined;
  description: string;
  source: TransactionSource;
  data?: Record<string, string | undefined>;
}

/**
 * Infer the op & description for a set of name, attributes and kind of a span.
 */
export function inferSpanData(spanName: string, attributes: SpanAttributes, kind: SpanKind): SpanDescription {
  // if http.method exists, this is an http request span
  // eslint-disable-next-line deprecation/deprecation
  const httpMethod = attributes[ATTR_HTTP_REQUEST_METHOD] || attributes[SEMATTRS_HTTP_METHOD];
  if (httpMethod) {
    return descriptionForHttpMethod({ attributes, name: spanName, kind }, httpMethod);
  }

  // eslint-disable-next-line deprecation/deprecation
  const dbSystem = attributes[SEMATTRS_DB_SYSTEM];
  const opIsCache =
    typeof attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'string' &&
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP].startsWith('cache.');

  // If db.type exists then this is a database call span
  // If the Redis DB is used as a cache, the span description should not be changed
  if (dbSystem && !opIsCache) {
    return descriptionForDbSystem({ attributes, name: spanName });
  }

  const customSourceOrRoute = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom' ? 'custom' : 'route';

  // If rpc.service exists then this is a rpc call span.
  // eslint-disable-next-line deprecation/deprecation
  const rpcService = attributes[SEMATTRS_RPC_SERVICE];
  if (rpcService) {
    return {
      ...getUserUpdatedNameAndSource(spanName, attributes, 'route'),
      op: 'rpc',
    };
  }

  // If messaging.system exists then this is a messaging system span.
  // eslint-disable-next-line deprecation/deprecation
  const messagingSystem = attributes[SEMATTRS_MESSAGING_SYSTEM];
  if (messagingSystem) {
    return {
      ...getUserUpdatedNameAndSource(spanName, attributes, customSourceOrRoute),
      op: 'message',
    };
  }

  // If faas.trigger exists then this is a function as a service span.
  // eslint-disable-next-line deprecation/deprecation
  const faasTrigger = attributes[SEMATTRS_FAAS_TRIGGER];
  if (faasTrigger) {
    return {
      ...getUserUpdatedNameAndSource(spanName, attributes, customSourceOrRoute),
      op: faasTrigger.toString(),
    };
  }

  return { op: undefined, description: spanName, source: 'custom' };
}

/**
 * Extract better op/description from an otel span.
 *
 * Does not overwrite the span name if the source is already set to custom to ensure
 * that user-updated span names are preserved. In this case, we only adjust the op but
 * leave span description and source unchanged.
 *
 * Based on https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/7422ce2a06337f68a59b552b8c5a2ac125d6bae5/exporter/sentryexporter/sentry_exporter.go#L306
 */
export function parseSpanDescription(span: AbstractSpan): SpanDescription {
  const attributes = spanHasAttributes(span) ? span.attributes : {};
  const name = spanHasName(span) ? span.name : '<unknown>';
  const kind = getSpanKind(span);
  // console.log('x parseSpanDesc', { attributes, name, kind });

  const res = inferSpanData(name, attributes, kind);

  // console.log('x parseSpanDesc res', res);
  return res;
}

function descriptionForDbSystem({ attributes, name }: { attributes: Attributes; name: string }): SpanDescription {
  // if we already have a custom name, we don't overwrite it but only set the op
  if (typeof attributes['_sentry_span_name_set_by_user'] === 'string') {
    return {
      op: 'db',
      description: attributes['_sentry_span_name_set_by_user'],
      source: (attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] as TransactionSource) || 'custom',
    };
  }

  // if we already have the source set to custom, we don't overwrite the span description but only set the op
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom') {
    return { op: 'db', description: name, source: 'custom' };
  }

  // Use DB statement (Ex "SELECT * FROM table") if possible as description.
  // eslint-disable-next-line deprecation/deprecation
  const statement = attributes[SEMATTRS_DB_STATEMENT];

  const description = statement ? statement.toString() : name;

  return { op: 'db', description, source: 'task' };
}

/** Only exported for tests. */
export function descriptionForHttpMethod(
  { name, kind, attributes }: { name: string; attributes: Attributes; kind: SpanKind },
  httpMethod: AttributeValue,
): SpanDescription {
  const opParts = ['http'];

  switch (kind) {
    case SpanKind.CLIENT:
      opParts.push('client');
      break;
    case SpanKind.SERVER:
      opParts.push('server');
      break;
  }

  // Spans for HTTP requests we have determined to be prefetch requests will have a `.prefetch` postfix in the op
  if (attributes['sentry.http.prefetch']) {
    opParts.push('prefetch');
  }

  const { urlPath, url, query, fragment, hasRoute } = getSanitizedUrl(attributes, kind);

  if (!urlPath) {
    return { ...getUserUpdatedNameAndSource(name, attributes), op: opParts.join('.') };
  }

  const graphqlOperationsAttribute = attributes[SEMANTIC_ATTRIBUTE_SENTRY_GRAPHQL_OPERATION];

  // Ex. GET /api/users
  const baseDescription = `${httpMethod} ${urlPath}`;

  // When the http span has a graphql operation, append it to the description
  // We add these in the graphqlIntegration
  const inferredDescription = graphqlOperationsAttribute
    ? `${baseDescription} (${getGraphqlOperationNamesFromAttribute(graphqlOperationsAttribute)})`
    : baseDescription;

  // If `httpPath` is a root path, then we can categorize the transaction source as route.
  const inferredSource: TransactionSource = hasRoute || urlPath === '/' ? 'route' : 'url';

  const data: Record<string, string> = {};

  if (url) {
    data.url = url;
  }
  if (query) {
    data['http.query'] = query;
  }
  if (fragment) {
    data['http.fragment'] = fragment;
  }

  // If the span kind is neither client nor server, we use the original name
  // this infers that somebody manually started this span, in which case we don't want to overwrite the name
  const isClientOrServerKind = kind === SpanKind.CLIENT || kind === SpanKind.SERVER;

  // If the span is an auto-span (=it comes from one of our instrumentations),
  // we always want to infer the name
  // this is necessary because some of the auto-instrumentation we use uses kind=INTERNAL
  const origin = attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] || 'manual';
  const isManualSpan = !`${origin}`.startsWith('auto');

  // If users (or in very rare occasions we) set the source to custom, we don't overwrite the name
  const alreadyHasCustomSource = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom';

  const useInferredDescription =
    !alreadyHasCustomSource &&
    attributes['_sentry_span_name_set_by_user'] == null &&
    (isClientOrServerKind || !isManualSpan);

  const { description, source } = useInferredDescription
    ? { description: inferredDescription, source: inferredSource }
    : getUserUpdatedNameAndSource(name, attributes);

  return {
    op: opParts.join('.'),
    description,
    source,
    data,
  };
}

function getGraphqlOperationNamesFromAttribute(attr: AttributeValue): string {
  if (Array.isArray(attr)) {
    const sorted = attr.slice().sort();

    // Up to 5 items, we just add all of them
    if (sorted.length <= 5) {
      return sorted.join(', ');
    } else {
      // Else, we add the first 5 and the diff of other operations
      return `${sorted.slice(0, 5).join(', ')}, +${sorted.length - 5}`;
    }
  }

  return `${attr}`;
}

/** Exported for tests only */
export function getSanitizedUrl(
  attributes: Attributes,
  kind: SpanKind,
): {
  url: string | undefined;
  urlPath: string | undefined;
  query: string | undefined;
  fragment: string | undefined;
  hasRoute: boolean;
} {
  // This is the relative path of the URL, e.g. /sub
  // eslint-disable-next-line deprecation/deprecation
  const httpTarget = attributes[SEMATTRS_HTTP_TARGET];
  // This is the full URL, including host & query params etc., e.g. https://example.com/sub?foo=bar
  // eslint-disable-next-line deprecation/deprecation
  const httpUrl = attributes[SEMATTRS_HTTP_URL] || attributes[ATTR_URL_FULL];
  // This is the normalized route name - may not always be available!
  const httpRoute = attributes[ATTR_HTTP_ROUTE];

  const parsedUrl = typeof httpUrl === 'string' ? parseUrl(httpUrl) : undefined;
  const url = parsedUrl ? getSanitizedUrlString(parsedUrl) : undefined;
  const query = parsedUrl && parsedUrl.search ? parsedUrl.search : undefined;
  const fragment = parsedUrl && parsedUrl.hash ? parsedUrl.hash : undefined;

  if (typeof httpRoute === 'string') {
    return { urlPath: httpRoute, url, query, fragment, hasRoute: true };
  }

  if (kind === SpanKind.SERVER && typeof httpTarget === 'string') {
    return { urlPath: stripUrlQueryAndFragment(httpTarget), url, query, fragment, hasRoute: false };
  }

  if (parsedUrl) {
    return { urlPath: url, url, query, fragment, hasRoute: false };
  }

  // fall back to target even for client spans, if no URL is present
  if (typeof httpTarget === 'string') {
    return { urlPath: stripUrlQueryAndFragment(httpTarget), url, query, fragment, hasRoute: false };
  }

  return { urlPath: undefined, url, query, fragment, hasRoute: false };
}

/**
 * Because Otel instrumentation sometimes mutates span names via `span.updateName`, the only way
 * to ensure that a user-set span name is preserved is to store it as a tmp attribute on the span.
 * We delete this attribute once we're done with it when preparing the event envelope.
 *
 * This temp attribute always takes precedence over the original name.
 *
 * We also need to take care of setting the correct source. Users can always update the source
 * after updating the name, so we need to respect that.
 *
 * @internal exported only for testing
 */
export function getUserUpdatedNameAndSource(
  originalName: string,
  attributes: Attributes,
  fallbackSource: TransactionSource = 'custom',
): {
  description: string;
  source: TransactionSource;
} {
  const source = (attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] as TransactionSource) || fallbackSource;

  if (attributes['_sentry_span_name_set_by_user'] && typeof attributes['_sentry_span_name_set_by_user'] === 'string')
    return {
      description: attributes['_sentry_span_name_set_by_user'],
      source,
    };

  return { description: originalName, source };
}
