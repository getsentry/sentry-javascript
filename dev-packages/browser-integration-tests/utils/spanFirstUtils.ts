import type { Page } from '@playwright/test';
import type { SpanV2Envelope, SpanV2JSON } from '@sentry/core';
import { properFullEnvelopeParser } from './helpers';

/**
 * Wait for a span v2 envelope
 */
export async function waitForSpanV2Envelope(
  page: Page,
  callback?: (spanEnvelope: SpanV2Envelope) => boolean,
): Promise<SpanV2Envelope> {
  const req = await page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      const spanEnvelope = properFullEnvelopeParser<SpanV2Envelope>(req);

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

  return properFullEnvelopeParser<SpanV2Envelope>(req);
}

/**
 * Wait for v2 spans sent in one envelope.
 * (We might need a more sophisticated helper that waits for N envelopes and buckets by traceId)
 * For now, this should do.
 * @param page
 * @param callback - Callback being called with all spans
 */
export async function waitForV2Spans(page: Page, callback?: (spans: SpanV2JSON[]) => boolean): Promise<SpanV2JSON[]> {
  const spanEnvelope = await waitForSpanV2Envelope(page, envelope => {
    if (callback) {
      return callback(envelope[1][0][1].items);
    }
    return true;
  });
  return spanEnvelope[1][0][1].items;
}

export async function waitForV2Span(page: Page, callback: (span: SpanV2JSON) => boolean): Promise<SpanV2JSON> {
  const spanEnvelope = await waitForSpanV2Envelope(page, envelope => {
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
 * throw errors if you encounter unwanted spans. You most likely want to use {@link waitForV2Span} instead!
 */
export async function observeV2Span(page: Page, callback: (span: SpanV2JSON) => boolean): Promise<void> {
  page.on('request', request => {
    const postData = request.postData();
    if (!postData) {
      return;
    }

    try {
      const spanEnvelope = properFullEnvelopeParser<SpanV2Envelope>(request);

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

      return true;
    } catch {
      return false;
    }
  });
}

export function getSpanOp(span: SpanV2JSON): string | undefined {
  return span.attributes?.['sentry.op']?.type === 'string' ? span.attributes?.['sentry.op']?.value : undefined;
}
