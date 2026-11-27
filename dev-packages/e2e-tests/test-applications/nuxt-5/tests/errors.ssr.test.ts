import { HTTP_RESPONSE_STATUS_CODE, URL_PATH } from '@sentry/conventions/attributes';
import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';

type EnvelopeItem = Parameters<Parameters<typeof waitForEnvelopeItem>[1]>[0];
type SentryErrorEvent = Awaited<ReturnType<typeof waitForError>>;

const SSR_ERROR_PATH = '/ssr-error';
const SSR_ERROR_MESSAGE = 'Nuxt 5 SSR error';
// The test requests this page after the failing page, so its root span arrives after every event of the failing
// request.
const BARRIER_PATH = '/test-param/ssr-error-barrier';

function getErrorEvents([header, payload]: EnvelopeItem): SentryErrorEvent[] {
  return header.type === 'event' ? [payload as SentryErrorEvent] : [];
}

function getStreamedSpans([header, payload]: EnvelopeItem): SerializedStreamedSpan[] {
  return header.type === 'span' ? (payload as { items: SerializedStreamedSpan[] }).items : [];
}

function hasErrorMessage(errorEvent: SentryErrorEvent, message: string): boolean {
  return !!errorEvent.exception?.values?.some(value => value.value?.startsWith(message));
}

function waitForRootSpan() {
  return waitForStreamedSpan(
    'nuxt-5',
    span => !!span.is_segment && span.attributes[URL_PATH]?.value === SSR_ERROR_PATH,
  );
}

test.describe('page that fails during SSR', () => {
  test('captures the error exactly once', async ({ request }) => {
    const requestId = `${Date.now()}`;
    // One listener for events and spans, so it has every event that the proxy received before the barrier span.
    const receivedErrors: SentryErrorEvent[] = [];
    const barrierPromise = waitForEnvelopeItem('nuxt-5', envelopeItem => {
      receivedErrors.push(...getErrorEvents(envelopeItem));
      return getStreamedSpans(envelopeItem).some(
        span => span.is_segment && span.attributes[URL_PATH]?.value === BARRIER_PATH,
      );
    });

    await request.get(`${SSR_ERROR_PATH}?id=${requestId}`);
    await request.get(BARRIER_PATH);
    await barrierPromise;

    const errorsOfRequest = receivedErrors.filter(errorEvent =>
      hasErrorMessage(errorEvent, `${SSR_ERROR_MESSAGE} ${requestId}`),
    );

    expect(errorsOfRequest).toHaveLength(1);
  });

  test('reports the error through the Nitro error hook', async ({ request }) => {
    const errorPromise = waitForError('nuxt-5', errorEvent => hasErrorMessage(errorEvent, SSR_ERROR_MESSAGE));

    await request.get(SSR_ERROR_PATH);

    const errorEvent = await errorPromise;

    expect(errorEvent.transaction).toBe(`GET ${SSR_ERROR_PATH}`);
    expect(errorEvent.exception?.values?.map(value => value.mechanism)).toEqual([
      { handled: true, type: 'chained', exception_id: 1, parent_id: 0, source: 'cause' },
      { handled: false, type: 'auto.function.nuxt.nitro', exception_id: 0 },
    ]);
  });

  test('marks the root span as errored', async ({ request }) => {
    const rootSpanPromise = waitForRootSpan();

    await request.get(SSR_ERROR_PATH);

    const rootSpan = await rootSpanPromise;

    expect(rootSpan.status).toBe('error');
    expect(rootSpan.attributes[HTTP_RESPONSE_STATUS_CODE]).toEqual({ type: 'integer', value: 500 });
  });

  test('names the root span after the page route', async ({ request }) => {
    test.fail(true, 'Known bug: the root span of a failed render gets no page route, so its name is `GET`');

    const rootSpanPromise = waitForRootSpan();

    await request.get(SSR_ERROR_PATH);

    const rootSpan = await rootSpanPromise;

    expect(rootSpan.name).toBe(`GET ${SSR_ERROR_PATH}`);
  });
});
