import { HTTP_RESPONSE_STATUS_CODE, HTTP_STATUS_CODE } from '@sentry/conventions/attributes';
import type { Span, SpanAttributes, SpanStatus } from '@sentry/core';
import { SPAN_STATUS_ERROR, SPAN_STATUS_UNSET } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { backfillHttpServerStatus } from '../../src/common/utils/backfillHttpServerStatus';

// Mimics an OTel SDK span shape so `spanToStaticSpanJSON` reads `data`/`status` off it (see
// `spanIsOpenTelemetrySdkTraceBaseSpan`: requires truthy attributes/startTime/name/endTime/status).
function makeSpan(attributes: SpanAttributes, status: SpanStatus = { code: SPAN_STATUS_UNSET }) {
  const setStatus = vi.fn();
  const span = {
    attributes,
    startTime: 1,
    endTime: 2,
    name: 'test',
    status,
    spanContext: () => ({ spanId: '1234', traceId: 'abcd', traceFlags: 0 }),
    setStatus,
  } as unknown as Span;
  return { span, setStatus };
}

describe('backfillHttpServerStatus', () => {
  it('derives an error status from http.response.status_code', () => {
    const { span, setStatus } = makeSpan({ [HTTP_RESPONSE_STATUS_CODE]: 400 });
    backfillHttpServerStatus(span);
    expect(setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'invalid_argument' });
  });

  it('derives internal_error from a 500 response', () => {
    const { span, setStatus } = makeSpan({ [HTTP_RESPONSE_STATUS_CODE]: 500 });
    backfillHttpServerStatus(span);
    expect(setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  });

  it('falls back to the deprecated http.status_code attribute', () => {
    // eslint-disable-next-line typescript/no-deprecated
    const { span, setStatus } = makeSpan({ [HTTP_STATUS_CODE]: 404 });
    backfillHttpServerStatus(span);
    expect(setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'not_found' });
  });

  it('does not change the status for a 2xx/3xx response', () => {
    const ok = makeSpan({ [HTTP_RESPONSE_STATUS_CODE]: 200 });
    backfillHttpServerStatus(ok.span);
    expect(ok.setStatus).not.toHaveBeenCalled();

    const redirect = makeSpan({ [HTTP_RESPONSE_STATUS_CODE]: 302 });
    backfillHttpServerStatus(redirect.span);
    expect(redirect.setStatus).not.toHaveBeenCalled();
  });

  it('does nothing when there is no numeric status code', () => {
    const empty = makeSpan({});
    backfillHttpServerStatus(empty.span);
    expect(empty.setStatus).not.toHaveBeenCalled();

    const nonNumeric = makeSpan({ [HTTP_RESPONSE_STATUS_CODE]: 'nope' } as unknown as SpanAttributes);
    backfillHttpServerStatus(nonNumeric.span);
    expect(nonNumeric.setStatus).not.toHaveBeenCalled();
  });

  it('does not override an already-set non-ok status', () => {
    const { span, setStatus } = makeSpan(
      { [HTTP_RESPONSE_STATUS_CODE]: 400 },
      { code: SPAN_STATUS_ERROR, message: 'internal_error' },
    );
    backfillHttpServerStatus(span);
    expect(setStatus).not.toHaveBeenCalled();
  });
});
