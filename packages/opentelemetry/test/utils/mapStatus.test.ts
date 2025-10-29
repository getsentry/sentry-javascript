/* eslint-disable deprecation/deprecation */
import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { SEMATTRS_HTTP_STATUS_CODE, SEMATTRS_RPC_GRPC_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import type { SpanStatus } from '@sentry/core';
import { SPAN_STATUS_ERROR, SPAN_STATUS_OK } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mapStatus } from '../../src/utils/mapStatus';
import { setupOtel } from '../helpers/initOtel';
import { cleanupOtel } from '../helpers/mockSdkInit';
import { getDefaultTestClientOptions, TestClient } from '../helpers/TestClient';

describe('mapStatus', () => {
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    [provider] = setupOtel(client);
  });

  afterEach(() => {
    cleanupOtel(provider);
  });

  function createSpan(name: string): Span {
    return trace.getTracer('test').startSpan(name);
  }

  const statusTestTable: [undefined | number | string, undefined | string, SpanStatus][] = [
    // http codes
    [400, undefined, { code: SPAN_STATUS_ERROR, message: 'invalid_argument' }],
    [401, undefined, { code: SPAN_STATUS_ERROR, message: 'unauthenticated' }],
    [403, undefined, { code: SPAN_STATUS_ERROR, message: 'permission_denied' }],
    [404, undefined, { code: SPAN_STATUS_ERROR, message: 'not_found' }],
    [409, undefined, { code: SPAN_STATUS_ERROR, message: 'already_exists' }],
    [429, undefined, { code: SPAN_STATUS_ERROR, message: 'resource_exhausted' }],
    [499, undefined, { code: SPAN_STATUS_ERROR, message: 'cancelled' }],
    [500, undefined, { code: SPAN_STATUS_ERROR, message: 'internal_error' }],
    [501, undefined, { code: SPAN_STATUS_ERROR, message: 'unimplemented' }],
    [503, undefined, { code: SPAN_STATUS_ERROR, message: 'unavailable' }],
    [504, undefined, { code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' }],
    [999, undefined, { code: SPAN_STATUS_ERROR, message: 'internal_error' }],

    // grpc codes
    [undefined, '1', { code: SPAN_STATUS_ERROR, message: 'cancelled' }],
    [undefined, '2', { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],
    [undefined, '3', { code: SPAN_STATUS_ERROR, message: 'invalid_argument' }],
    [undefined, '4', { code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' }],
    [undefined, '5', { code: SPAN_STATUS_ERROR, message: 'not_found' }],
    [undefined, '6', { code: SPAN_STATUS_ERROR, message: 'already_exists' }],
    [undefined, '7', { code: SPAN_STATUS_ERROR, message: 'permission_denied' }],
    [undefined, '8', { code: SPAN_STATUS_ERROR, message: 'resource_exhausted' }],
    [undefined, '9', { code: SPAN_STATUS_ERROR, message: 'failed_precondition' }],
    [undefined, '10', { code: SPAN_STATUS_ERROR, message: 'aborted' }],
    [undefined, '11', { code: SPAN_STATUS_ERROR, message: 'out_of_range' }],
    [undefined, '12', { code: SPAN_STATUS_ERROR, message: 'unimplemented' }],
    [undefined, '13', { code: SPAN_STATUS_ERROR, message: 'internal_error' }],
    [undefined, '14', { code: SPAN_STATUS_ERROR, message: 'unavailable' }],
    [undefined, '15', { code: SPAN_STATUS_ERROR, message: 'data_loss' }],
    [undefined, '16', { code: SPAN_STATUS_ERROR, message: 'unauthenticated' }],
    [undefined, '999', { code: SPAN_STATUS_ERROR, message: 'unknown_error' }],

    // http takes precedence over grpc
    [400, '2', { code: SPAN_STATUS_ERROR, message: 'invalid_argument' }],
  ];

  it.each(statusTestTable)('works with httpCode=%s, grpcCode=%s', (httpCode, grpcCode, expected) => {
    const span = createSpan('test-span');
    span.setStatus({ code: 0 }); // UNSET

    if (httpCode) {
      span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, httpCode);
    }

    if (grpcCode) {
      span.setAttribute(SEMATTRS_RPC_GRPC_STATUS_CODE, grpcCode);
    }

    const actual = mapStatus(span);
    expect(actual).toEqual(expected);
  });

  it('works with string SEMATTRS_HTTP_STATUS_CODE', () => {
    const span = createSpan('test-span');

    span.setStatus({ code: 0 }); // UNSET
    span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, '400');

    const actual = mapStatus(span);
    expect(actual).toEqual({ code: SPAN_STATUS_ERROR, message: 'invalid_argument' });
  });

  it('returns ok span status when is UNSET present on span', () => {
    const span = createSpan('test-span');
    span.setStatus({ code: 0 }); // UNSET
    expect(mapStatus(span)).toEqual({ code: SPAN_STATUS_OK });
  });

  it('returns ok span status when already present on span', () => {
    const span = createSpan('test-span');
    span.setStatus({ code: 1 }); // OK
    expect(mapStatus(span)).toEqual({ code: SPAN_STATUS_OK });
  });

  it('returns error status when span already has error status', () => {
    const span = createSpan('test-span');
    span.setStatus({ code: 2, message: 'invalid_argument' }); // ERROR
    expect(mapStatus(span)).toEqual({ code: SPAN_STATUS_ERROR, message: 'invalid_argument' });
  });

  it('returns error status when span already has error status without message', () => {
    const span = createSpan('test-span');
    span.setStatus({ code: 2 }); // ERROR
    expect(mapStatus(span)).toEqual({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  });

  it('infers error status form attributes when span already has error status without message', () => {
    const span = createSpan('test-span');
    span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, 500);
    span.setStatus({ code: 2 }); // ERROR
    expect(mapStatus(span)).toEqual({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  });

  it('returns unknown error status when code is unknown', () => {
    const span = createSpan('test-span');
    span.setStatus({ code: -1 as 0 });
    expect(mapStatus(span)).toEqual({ code: SPAN_STATUS_ERROR, message: 'unknown_error' });
  });
});
