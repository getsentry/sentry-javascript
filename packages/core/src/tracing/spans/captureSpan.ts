import type { RawAttributes } from '../../attributes';
import type { Client } from '../../client';
import type { ScopeData } from '../../scope';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
} from '../../semanticAttributes';
import type { RequestDataIncludeOptions } from '../../integrations/requestdata';
import type { Integration } from '../../types-hoist/integration';
import type { QueryParams, RequestEventData } from '../../types-hoist/request';
import type { SerializedStreamedSpan, Span, StreamedSpanJSON } from '../../types-hoist/span';
import { httpHeadersToSpanAttributes } from '../../utils/request';
import { getCombinedScopeData } from '../../utils/scopeData';
import { getSanitizedUrlString, parseUrl, stripUrlQueryAndFragment } from '../../utils/url';
import { getClientIPAddress, ipHeaderNames } from '../../vendor/getIpAddress';
import {
  INTERNAL_getSegmentSpan,
  showSpanDropWarning,
  spanToStreamedSpanJSON,
  streamedSpanJsonToSerializedSpan,
} from '../../utils/spanUtils';
import { getCapturedScopesOnSpan } from '../utils';
import { isStreamedBeforeSendSpanCallback } from './beforeSendSpan';

export type SerializedStreamedSpanWithSegmentSpan = SerializedStreamedSpan & {
  _segmentSpan: Span;
};

/**
 * Captures a span and returns a JSON representation to be enqueued for sending.
 *
 * IMPORTANT: This function converts the span to JSON immediately to avoid writing
 * to an already-ended OTel span instance (which is blocked by the OTel Span class).
 *
 * @returns the final serialized span with a reference to its segment span. This reference
 * is needed later on to compute the DSC for the span envelope.
 */
export function captureSpan(span: Span, client: Client): SerializedStreamedSpanWithSegmentSpan {
  // Convert to JSON FIRST - we cannot write to an already-ended span
  const spanJSON = spanToStreamedSpanJSON(span);

  const segmentSpan = INTERNAL_getSegmentSpan(span);
  const serializedSegmentSpan = spanToStreamedSpanJSON(segmentSpan);

  const { isolationScope: spanIsolationScope, scope: spanScope } = getCapturedScopesOnSpan(span);

  const finalScopeData = getCombinedScopeData(spanIsolationScope, spanScope);

  applyCommonSpanAttributes(spanJSON, serializedSegmentSpan, client, finalScopeData);

  // Backfill span data from OTel semantic conventions when not explicitly set.
  // OTel-originated spans don't have sentry.op, description, etc. — the non-streamed path
  // infers these in the SentrySpanExporter, but streamed spans skip the exporter entirely.
  // Access `kind` via duck-typing — OTel span objects have this property but it's not on Sentry's Span type.
  // This must run before all hooks and beforeSendSpan so that user callbacks can see and override inferred values.
  const spanKind = (span as { kind?: number }).kind;
  inferSpanDataFromOtelAttributes(spanJSON, spanKind);

  if (spanJSON.is_segment) {
    applyScopeToSegmentSpan(spanJSON, finalScopeData, client);
    // Allow hook subscribers to mutate the segment span JSON
    // This also invokes the `processSegmentSpan` hook of all integrations
    client.emit('processSegmentSpan', spanJSON);
  }

  // This allows hook subscribers to mutate the span JSON
  // This also invokes the `processSpan` hook of all integrations
  client.emit('processSpan', spanJSON);

  const { beforeSendSpan } = client.getOptions();
  const processedSpan =
    beforeSendSpan && isStreamedBeforeSendSpanCallback(beforeSendSpan)
      ? applyBeforeSendSpanCallback(spanJSON, beforeSendSpan)
      : spanJSON;

  // Backfill sentry.span.source from sentry.source. Only `sentry.span.source` is respected by Sentry.
  // TODO(v11): Remove this backfill once we renamed SEMANTIC_ATTRIBUTE_SENTRY_SOURCE to sentry.span.source
  const spanNameSource = processedSpan.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
  if (spanNameSource) {
    safeSetSpanJSONAttributes(processedSpan, {
      // Purposefully not using a constant defined here like in other attributes:
      // This will be the name for SEMANTIC_ATTRIBUTE_SENTRY_SOURCE in v11
      'sentry.span.source': spanNameSource,
    });
  }

  return {
    ...streamedSpanJsonToSerializedSpan(processedSpan),
    _segmentSpan: segmentSpan,
  };
}

function applyScopeToSegmentSpan(segmentSpanJSON: StreamedSpanJSON, scopeData: ScopeData, client: Client): void {
  const { normalizedRequest, ipAddress } = scopeData.sdkProcessingMetadata;

  const integration = client.getIntegrationByName<Integration & { _include: RequestDataIncludeOptions }>('RequestData');
  if (normalizedRequest && integration) {
    const { sendDefaultPii } = client.getOptions();
    const include: RequestDataIncludeOptions = {
      ...integration._include,
      ip: integration._include.ip ?? sendDefaultPii,
    };
    applyRequestDataToSegmentSpan(segmentSpanJSON, normalizedRequest, ipAddress, include, sendDefaultPii);
  }
}

// Span-streaming counterpart of requestDataIntegration's processEvent.
function applyRequestDataToSegmentSpan(
  segmentSpanJSON: StreamedSpanJSON,
  normalizedRequest: RequestEventData,
  ipAddress: string | undefined,
  include: RequestDataIncludeOptions,
  sendDefaultPii: boolean | undefined,
): void {
  const attributes: Record<string, unknown> = {};

  if (include.url && normalizedRequest.url) {
    attributes['url.full'] = normalizedRequest.url;
  }

  if (normalizedRequest.method) {
    attributes['http.request.method'] = normalizedRequest.method;
  }

  if (include.query_string && normalizedRequest.query_string) {
    attributes['url.query'] = normalizeQueryString(normalizedRequest.query_string);
  }

  safeSetSpanJSONAttributes(segmentSpanJSON, attributes);

  if (include.headers && normalizedRequest.headers) {
    const headers = { ...normalizedRequest.headers };

    if (!include.cookies) {
      delete headers.cookie;
    }

    if (!include.ip) {
      const ipHeaderNamesLower = new Set(ipHeaderNames.map(name => name.toLowerCase()));
      for (const key of Object.keys(headers)) {
        if (ipHeaderNamesLower.has(key.toLowerCase())) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete headers[key];
        }
      }
    }

    const headerAttributes = httpHeadersToSpanAttributes(headers, sendDefaultPii ?? false, 'request');
    safeSetSpanJSONAttributes(segmentSpanJSON, headerAttributes);
  }

  if (include.cookies && normalizedRequest.cookies) {
    const cookieString = Object.entries(normalizedRequest.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    if (cookieString) {
      const cookieAttributes = httpHeadersToSpanAttributes(
        { cookie: cookieString },
        sendDefaultPii ?? false,
        'request',
      );
      safeSetSpanJSONAttributes(segmentSpanJSON, cookieAttributes);
    }
  }

  if (include.data && normalizedRequest.data != null) {
    const serialized =
      typeof normalizedRequest.data === 'string' ? normalizedRequest.data : JSON.stringify(normalizedRequest.data);
    if (serialized) {
      safeSetSpanJSONAttributes(segmentSpanJSON, { 'http.request.body.data': serialized });
    }
  }

  if (include.ip) {
    const ip = (normalizedRequest.headers && getClientIPAddress(normalizedRequest.headers)) || ipAddress || undefined;
    if (ip) {
      safeSetSpanJSONAttributes(segmentSpanJSON, { [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: ip });
    }
  }
}

function normalizeQueryString(queryString: QueryParams): string | undefined {
  if (typeof queryString === 'string') {
    return queryString || undefined;
  }

  const pairs = Array.isArray(queryString) ? queryString : Object.entries(queryString);
  const result = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');

  return result || undefined;
}

function applyCommonSpanAttributes(
  spanJSON: StreamedSpanJSON,
  serializedSegmentSpan: StreamedSpanJSON,
  client: Client,
  scopeData: ScopeData,
): void {
  const sdk = client.getSdkMetadata();
  const { release, environment, sendDefaultPii } = client.getOptions();

  // avoid overwriting any previously set attributes (from users or potentially our SDK instrumentation)
  safeSetSpanJSONAttributes(spanJSON, {
    [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: release,
    [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: environment,
    [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]: serializedSegmentSpan.name,
    [SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]: serializedSegmentSpan.span_id,
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]: sdk?.sdk?.name,
    [SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]: sdk?.sdk?.version,
    ...(sendDefaultPii
      ? {
          [SEMANTIC_ATTRIBUTE_USER_ID]: scopeData.user?.id,
          [SEMANTIC_ATTRIBUTE_USER_EMAIL]: scopeData.user?.email,
          [SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]: scopeData.user?.ip_address,
          [SEMANTIC_ATTRIBUTE_USER_USERNAME]: scopeData.user?.username,
        }
      : {}),
    ...scopeData.attributes,
  });
}

/**
 * Apply a user-provided beforeSendSpan callback to a span JSON.
 */
export function applyBeforeSendSpanCallback(
  span: StreamedSpanJSON,
  beforeSendSpan: (span: StreamedSpanJSON) => StreamedSpanJSON,
): StreamedSpanJSON {
  const modifedSpan = beforeSendSpan(span);
  if (!modifedSpan) {
    showSpanDropWarning();
    return span;
  }
  return modifedSpan;
}

/**
 * Safely set attributes on a span JSON.
 * If an attribute already exists, it will not be overwritten.
 */
export function safeSetSpanJSONAttributes(
  spanJSON: StreamedSpanJSON,
  newAttributes: RawAttributes<Record<string, unknown>>,
): void {
  const originalAttributes = spanJSON.attributes ?? (spanJSON.attributes = {});

  Object.entries(newAttributes).forEach(([key, value]) => {
    if (value != null && !(key in originalAttributes)) {
      originalAttributes[key] = value;
    }
  });
}

// OTel SpanKind values (numeric to avoid importing from @opentelemetry/api)
const SPAN_KIND_SERVER = 1;
const SPAN_KIND_CLIENT = 2;

/**
 * Infer and backfill span data from OTel semantic conventions.
 * This mirrors what the `SentrySpanExporter` does for non-streamed spans via `getSpanData`/`inferSpanData`.
 * Streamed spans skip the exporter, so we do the inference here during capture.
 *
 * Backfills: `sentry.op`, `sentry.source`, and `name` (description).
 * Uses `safeSetSpanJSONAttributes` so explicitly set attributes are never overwritten.
 */
/** Exported only for tests. */
export function inferSpanDataFromOtelAttributes(spanJSON: StreamedSpanJSON, spanKind?: number): void {
  const attributes = spanJSON.attributes;
  if (!attributes) {
    return;
  }

  const httpMethod = attributes['http.request.method'] || attributes['http.method'];
  if (httpMethod) {
    inferHttpSpanData(spanJSON, attributes, spanKind, httpMethod);
    return;
  }

  const dbSystem = attributes['db.system.name'] || attributes['db.system'];
  const opIsCache =
    typeof attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'string' &&
    `${attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP]}`.startsWith('cache.');
  if (dbSystem && !opIsCache) {
    inferDbSpanData(spanJSON, attributes);
    return;
  }

  if (attributes['rpc.service']) {
    safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'rpc' });
    return;
  }

  if (attributes['messaging.system']) {
    safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'message' });
    return;
  }

  const faasTrigger = attributes['faas.trigger'];
  if (faasTrigger) {
    safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${faasTrigger}` });
  }
}

function inferHttpSpanData(
  spanJSON: StreamedSpanJSON,
  attributes: RawAttributes<Record<string, unknown>>,
  spanKind: number | undefined,
  httpMethod: unknown,
): void {
  // Infer op: http.client, http.server, or just http
  const opParts = ['http'];
  if (spanKind === SPAN_KIND_CLIENT) {
    opParts.push('client');
  } else if (spanKind === SPAN_KIND_SERVER) {
    opParts.push('server');
  }
  if (attributes['sentry.http.prefetch']) {
    opParts.push('prefetch');
  }
  safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: opParts.join('.') });

  // If the user set a custom span name via updateSpanName(), apply it — OTel instrumentation
  // may have overwritten span.name after the user set it, so we restore from the attribute.
  const customName = attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
  if (typeof customName === 'string') {
    spanJSON.name = customName;
    return;
  }

  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom') {
    return;
  }

  const httpRoute = attributes['http.route'];
  if (typeof httpRoute === 'string') {
    spanJSON.name = `${httpMethod} ${httpRoute}`;
    safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' });
  } else {
    // Infer span name from URL attributes, matching the non-streamed exporter's behavior.
    // Only overwrite the name for OTel spans (known spanKind)
    if (spanKind === SPAN_KIND_CLIENT || spanKind === SPAN_KIND_SERVER) {
      const urlPath = getUrlPath(attributes, spanKind);
      if (urlPath) {
        spanJSON.name = `${httpMethod} ${urlPath}`;
      }
    }
    safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' });
  }
}

/**
 * Extract a URL path from span attributes for use in the span name.
 * Mirrors the logic in the non-streamed exporter's `getSanitizedUrl`.
 */
function getUrlPath(
  attributes: RawAttributes<Record<string, unknown>>,
  spanKind: number | undefined,
): string | undefined {
  const httpUrl = attributes['http.url'] || attributes['url.full'];
  const httpTarget = attributes['http.target'];

  const parsedUrl = typeof httpUrl === 'string' ? parseUrl(httpUrl) : undefined;
  const sanitizedUrl = parsedUrl ? getSanitizedUrlString(parsedUrl) : undefined;

  // For server spans, prefer the relative target path
  if (spanKind === SPAN_KIND_SERVER && typeof httpTarget === 'string') {
    return stripUrlQueryAndFragment(httpTarget);
  }

  // For client spans (and others), use the full sanitized URL
  if (sanitizedUrl) {
    return sanitizedUrl;
  }

  // Fall back to target if no full URL is available
  if (typeof httpTarget === 'string') {
    return stripUrlQueryAndFragment(httpTarget);
  }

  return undefined;
}

function inferDbSpanData(spanJSON: StreamedSpanJSON, attributes: RawAttributes<Record<string, unknown>>): void {
  safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db' });

  // If the user set a custom span name via updateSpanName(), apply it.
  const customName = attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME];
  if (typeof customName === 'string') {
    spanJSON.name = customName;
    return;
  }

  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom') {
    return;
  }

  const statement = attributes['db.statement'];
  if (statement) {
    spanJSON.name = `${statement}`;
    safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task' });
  }
}
