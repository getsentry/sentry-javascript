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
import type { SerializedStreamedSpan, Span, StreamedSpanJSON } from '../../types-hoist/span';
import { getCombinedScopeData } from '../../utils/scopeData';
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

  if (spanJSON.is_segment) {
    applyScopeToSegmentSpan(spanJSON, finalScopeData);
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

  // Backfill span data from OTel semantic conventions when not explicitly set.
  // OTel-originated spans don't have sentry.op, description, etc. — the non-streamed path
  // infers these in the SentrySpanExporter, but streamed spans skip the exporter entirely.
  // Access `kind` via duck-typing — OTel span objects have this property but it's not on Sentry's Span type.
  const spanKind = (span as { kind?: number }).kind;
  inferSpanDataFromOtelAttributes(processedSpan, spanKind);

  return {
    ...streamedSpanJsonToSerializedSpan(processedSpan),
    _segmentSpan: segmentSpan,
  };
}

function applyScopeToSegmentSpan(_segmentSpanJSON: StreamedSpanJSON, _scopeData: ScopeData): void {
  // TODO: Apply all scope and request data from auto instrumentation (contexts, request) to segment span
  // This will follow in a separate PR
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
function inferSpanDataFromOtelAttributes(spanJSON: StreamedSpanJSON, spanKind?: number): void {
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
  if (dbSystem) {
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

  // If the user already set a custom name or source, don't overwrite
  if (
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME] ||
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom'
  ) {
    return;
  }

  // Only overwrite the span name when we have an explicit http.route — it's more specific than
  // what OTel instrumentation sets as the span name. For all other cases (url.full, http.target),
  // the OTel-set name is already good enough and we'd risk producing a worse name (e.g. full URL).
  const httpRoute = attributes['http.route'];
  if (typeof httpRoute === 'string') {
    spanJSON.name = `${httpMethod} ${httpRoute}`;
    safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' });
  }
}

function inferDbSpanData(spanJSON: StreamedSpanJSON, attributes: RawAttributes<Record<string, unknown>>): void {
  safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db' });

  if (
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME] ||
    attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] === 'custom'
  ) {
    return;
  }

  const statement = attributes['db.statement'];
  if (statement) {
    spanJSON.name = `${statement}`;
    safeSetSpanJSONAttributes(spanJSON, { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task' });
  }
}
