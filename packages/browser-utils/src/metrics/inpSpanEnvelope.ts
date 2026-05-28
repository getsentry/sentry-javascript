import type { Client, DynamicSamplingContext, Span, SpanAttributes } from '@sentry/core';
import {
  _INTERNAL_captureSpan,
  _INTERNAL_createStreamedSpanEnvelope,
  addChildSpanToSpan,
  generateSpanId,
  getClient,
  getCurrentScope,
  getDynamicSamplingContextFromScope,
  getDynamicSamplingContextFromSpan,
  parseSampleRate,
  sampleSpan,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
  shouldIgnoreSpan,
  spanIsSampled,
} from '@sentry/core';
import { WINDOW } from '../types';

export interface InpSpanEnvelopeOptions {
  duration: number;
  entryDuration: number;
  interactionType: 'click' | 'hover' | 'drag' | 'press';
  name: string;
  parentSpan: Span | undefined;
  routeName: string | undefined;
  startTime: number;
  value: number;
}

export function sendInpSpanEnvelope(options: InpSpanEnvelopeOptions): void {
  const { duration, entryDuration, interactionType, name, parentSpan, routeName, startTime, value } = options;
  sendWebVitalSpanEnvelope({
    attributes: {
      [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: entryDuration,
    },
    duration,
    metricName: 'inp',
    name,
    op: `ui.interaction.${interactionType}`,
    origin: 'auto.http.browser.inp',
    parentSpan,
    routeName,
    startTime,
    value,
  });
}

export interface WebVitalSpanEnvelopeOptions {
  attributes?: SpanAttributes;
  duration: number;
  metricName: 'cls' | 'inp' | 'lcp';
  name: string;
  op: string;
  origin: string;
  parentSpan: Span | undefined;
  reportEvent?: string;
  routeName: string | undefined;
  startTime: number;
  value: number;
}

export function sendWebVitalSpanEnvelope(options: WebVitalSpanEnvelopeOptions): void {
  const {
    attributes: passedAttributes,
    duration,
    metricName,
    name,
    op,
    origin,
    parentSpan,
    reportEvent,
    routeName,
    startTime,
    value,
  } = options;
  const client = getClient();

  if (!client) {
    return;
  }

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 0,
    [`browser.web_vital.${metricName}.value`]: value,
    'sentry.transaction': routeName,
    'user_agent.original': WINDOW.navigator?.userAgent,
    ...passedAttributes,
  };

  if (reportEvent) {
    attributes[`browser.web_vital.${metricName}.report_event`] = reportEvent;
  }

  if (shouldIgnoreSpan({ description: name, op, attributes }, client.getOptions().ignoreSpans ?? [])) {
    client.recordDroppedEvent('ignored', 'span');
    return;
  }

  const traceContext = getTraceContext({ attributes, client, parentSpan, routeName });
  if (!traceContext) {
    return;
  }

  const spanId = generateSpanId();
  const safeStartTime = Number.isFinite(startTime) && startTime > 0 ? startTime : 1;
  const safeEndTime = Number.isFinite(startTime + duration) ? startTime + duration : safeStartTime;
  const span = {
    attributes,
    endTime: safeEndTime,
    name,
    parentSpanId: traceContext.parentSpanId,
    startTime: safeStartTime,
    status: { code: 1 },
    spanContext: () => ({
      spanId,
      traceFlags: traceContext.sampled ? 1 : 0,
      traceId: traceContext.traceId,
    }),
  } as unknown as Span;

  if (parentSpan) {
    addChildSpanToSpan(parentSpan, span);
  }

  const { _segmentSpan, ...serializedSpan } = _INTERNAL_captureSpan(span, client);
  const envelope = _INTERNAL_createStreamedSpanEnvelope([serializedSpan], traceContext.dsc, client);

  client.sendEnvelope(envelope).then(null, () => {
    // noop
  });
}

function getTraceContext(options: {
  attributes: SpanAttributes;
  client: Client;
  parentSpan: Span | undefined;
  routeName: string | undefined;
}):
  | {
      dsc: Partial<DynamicSamplingContext>;
      parentSpanId: string | undefined;
      sampled: boolean | undefined;
      traceId: string;
    }
  | undefined {
  const { attributes, client, parentSpan, routeName } = options;
  const scope = getCurrentScope();
  const propagationContext = scope.getPropagationContext();

  if (parentSpan) {
    if (!spanIsSampled(parentSpan)) {
      client.recordDroppedEvent('sample_rate', 'span');
      return undefined;
    }

    const parentSpanContext = parentSpan.spanContext();

    return {
      dsc: getDynamicSamplingContextFromSpan(parentSpan),
      parentSpanId: parentSpanContext.spanId,
      sampled: true,
      traceId: parentSpanContext.traceId,
    };
  }

  const dsc = getDynamicSamplingContextFromScope(client, scope);
  const [sampled, sampleRate, localSampleRateWasApplied] = sampleSpan(
    client.getOptions(),
    {
      name: routeName || '<unknown>',
      attributes,
      parentSampled: propagationContext.sampled,
      parentSampleRate: parseSampleRate(propagationContext.dsc?.sample_rate),
    },
    propagationContext.sampleRand,
  );

  if (!sampled) {
    client.recordDroppedEvent('sample_rate', 'span');
    return undefined;
  }

  if (sampleRate !== undefined) {
    dsc.sample_rate = `${sampleRate}`;
    if (localSampleRateWasApplied) {
      attributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE] = sampleRate;
    }
  }

  dsc.sampled = String(sampled);
  dsc.sample_rand = propagationContext.sampleRand.toString();
  if (routeName) {
    dsc.transaction = routeName;
  }

  return {
    dsc,
    parentSpanId: propagationContext.parentSpanId,
    sampled,
    traceId: propagationContext.traceId,
  };
}
