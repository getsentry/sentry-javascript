import { SentrySpan, setHttpStatus, spanToJSON } from '../../../src/index';

describe('setHttpStatus', () => {
  it.each([
    [200, 'ok'],
    [300, 'ok'],
    [401, 'unauthenticated'],
    [403, 'permission_denied'],
    [404, 'not_found'],
    [409, 'already_exists'],
    [413, 'failed_precondition'],
    [429, 'resource_exhausted'],
    [455, 'invalid_argument'],
    [501, 'unimplemented'],
    [503, 'unavailable'],
    [504, 'deadline_exceeded'],
    [520, 'internal_error'],
  ])('applies the correct span status and http status code to the span (%s - $%s)', (code, status) => {
    const span = new SentrySpan({ name: 'test' });

    setHttpStatus(span, code);

    const { status: spanStatus, data } = spanToJSON(span);

    expect(spanStatus).toBe(status);
    expect(data).toMatchObject({ 'http.response.status_code': code });
  });

  it("doesn't set the status for an unknown http status code", () => {
    const span = new SentrySpan({ name: 'test' });

    setHttpStatus(span, 600);

    const { status: spanStatus, data } = spanToJSON(span);

    expect(spanStatus).toBeUndefined();
    expect(data).toMatchObject({ 'http.response.status_code': 600 });
  });
});
