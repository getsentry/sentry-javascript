import type { Page } from '@playwright/test';
import type { DynamicSamplingContext, SerializedStreamedSpan, StreamedSpanEnvelope } from '@sentry/core';
import { properFullEnvelopeParser } from './helpers';

/**
 * Wait for a full span v2 envelope
 * Useful for testing the entire envelope shape
 */
export async function waitForStreamedSpanEnvelope(
  page: Page,
  callback?: (spanEnvelope: StreamedSpanEnvelope) => boolean,
): Promise<StreamedSpanEnvelope> {
  const req = await page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      const spanEnvelope = properFullEnvelopeParser<StreamedSpanEnvelope>(req);

      const envelopeItemHeader = spanEnvelope[1][0][0];

      if (
        envelopeItemHeader?.type !== 'span' ||
        envelopeItemHeader?.content_type !== 'application/vnd.sentry.items.span.v2+json'
      ) {
        return false;
      }

      if (callback) {
        return callback(spanEnvelope);
      }

      return true;
    } catch {
      return false;
    }
  });

  return properFullEnvelopeParser<StreamedSpanEnvelope>(req);
}

/**
 * Wait for v2 spans sent in one envelope.
 * Useful for testing multiple spans in one envelope.
 * @param page
 * @param callback - Callback being called with all spans
 */
export async function waitForStreamedSpans(
  page: Page,
  callback?: (spans: SerializedStreamedSpan[]) => boolean,
): Promise<SerializedStreamedSpan[]> {
  const spanEnvelope = await waitForStreamedSpanEnvelope(page, envelope => {
    if (callback) {
      return callback(envelope[1][0][1].items);
    }
    return true;
  });
  return spanEnvelope[1][0][1].items;
}

export async function waitForStreamedSpan(
  page: Page,
  callback: (span: SerializedStreamedSpan) => boolean,
): Promise<SerializedStreamedSpan> {
  const spanEnvelope = await waitForStreamedSpanEnvelope(page, envelope => {
    if (callback) {
      const spans = envelope[1][0][1].items;
      return spans.some(span => callback(span));
    }
    return true;
  });
  const firstMatchingSpan = spanEnvelope[1][0][1].items.find(span => callback(span));
  if (!firstMatchingSpan) {
    throw new Error(
      'No matching span found but envelope search matched previously. Something is likely off with this function. Debug me.',
    );
  }
  return firstMatchingSpan;
}

/**
 * Observes outgoing requests and looks for sentry envelope requests. If an envelope request is found, it applies
 * @param callback to check for a matching span.
 *
 * Important: This function only observes requests and does not block the test when it ends. Use this primarily to
 * throw errors if you encounter unwanted spans. You most likely want to use {@link waitForStreamedSpan} or {@link waitForStreamedSpans} instead!
 */
export async function observeStreamedSpan(
  page: Page,
  callback: (span: SerializedStreamedSpan) => boolean,
): Promise<void> {
  page.on('request', request => {
    const postData = request.postData();
    if (!postData) {
      return;
    }

    try {
      const spanEnvelope = properFullEnvelopeParser<StreamedSpanEnvelope>(request);

      const envelopeItemHeader = spanEnvelope[1][0][0];

      if (
        envelopeItemHeader?.type !== 'span' ||
        envelopeItemHeader?.content_type !== 'application/vnd.sentry.items.span.v2+json'
      ) {
        return false;
      }

      const spans = spanEnvelope[1][0][1].items;

      for (const span of spans) {
        if (callback(span)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  });
}

export function getSpanOp(span: SerializedStreamedSpan): string | undefined {
  return span.attributes['sentry.op']?.type === 'string' ? span.attributes['sentry.op']?.value : undefined;
}

export function getSpansFromEnvelope(envelope: StreamedSpanEnvelope): SerializedStreamedSpan[] {
  return envelope[1][0][1].items;
}

export type StreamedSpanAndTraceHeader = [SerializedStreamedSpan, Partial<DynamicSamplingContext> | undefined];

export async function waitForStreamedSpanAndTraceHeader(
  page: Page,
  callback: (span: SerializedStreamedSpan) => boolean = span => span.is_segment,
): Promise<StreamedSpanAndTraceHeader> {
  const envelope = await waitForStreamedSpanEnvelope(page, envelope => envelope[1][0][1].items.some(callback));
  const span = envelope[1][0][1].items.find(callback)!;
  return [span, envelope[0].trace];
}

export async function waitForStreamedSpanAndTraceHeaderOnUrl(
  page: Page,
  url: string,
  callback?: (span: SerializedStreamedSpan) => boolean,
): Promise<StreamedSpanAndTraceHeader> {
  const [spanAndTraceHeader] = await Promise.all([waitForStreamedSpanAndTraceHeader(page, callback), page.goto(url)]);
  return spanAndTraceHeader;
}

export function collectStreamedSpans(page: Page): SerializedStreamedSpan[] {
  const spans: SerializedStreamedSpan[] = [];
  page.on('request', request => {
    if (!request.postData()) {
      return;
    }
    try {
      const envelope = properFullEnvelopeParser<StreamedSpanEnvelope>(request);
      const header = envelope[1][0][0];
      if (header.type === 'span' && header.content_type === 'application/vnd.sentry.items.span.v2+json') {
        spans.push(...envelope[1][0][1].items);
      }
    } catch {
      // Other requests may contain bodies which are not envelopes.
    }
  });
  return spans;
}
