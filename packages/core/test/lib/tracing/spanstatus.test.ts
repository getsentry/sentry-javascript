import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE,
  SentrySpan,
  setHttpStatus,
  spanToStreamedSpanJSON,
} from '../../../src/index';

describe('setHttpStatus', () => {
  it.each([
    [200, 'ok', undefined],
    [300, 'ok', undefined],
    [401, 'error', 'unauthenticated'],
    [403, 'error', 'permission_denied'],
    [404, 'error', 'not_found'],
    [409, 'error', 'already_exists'],
    [413, 'error', 'failed_precondition'],
    [429, 'error', 'resource_exhausted'],
    [455, 'error', 'invalid_argument'],
    [501, 'error', 'unimplemented'],
    [503, 'error', 'unavailable'],
    [504, 'error', 'deadline_exceeded'],
    [520, 'error', 'internal_error'],
  ])('applies the correct span status and http status code to the span (%s - $%s)', (code, status, statusMessage) => {
    const span = new SentrySpan({ name: 'test' });

    setHttpStatus(span, code as number);

    const { status: spanStatus, attributes } = spanToStreamedSpanJSON(span);

    expect(spanStatus).toBe(status);
    expect(attributes[SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE]).toBe(statusMessage);
    expect(attributes).toMatchObject({ 'http.response.status_code': code });
  });

  it('defaults to internal_error', () => {
    const span = new SentrySpan({ name: 'test' });

    setHttpStatus(span, 600);

    const { status: spanStatus, attributes } = spanToStreamedSpanJSON(span);

    expect(spanStatus).toBe('error');
    expect(attributes[SEMANTIC_ATTRIBUTE_SENTRY_STATUS_MESSAGE]).toBe('internal_error');
    expect(attributes).toMatchObject({ 'http.response.status_code': 600 });
  });
});
