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

export function getSpanOp(span: SpanV2JSON): string | undefined {
  return span.attributes?.['sentry.op']?.type === 'string' ? span.attributes?.['sentry.op']?.value : undefined;
}
