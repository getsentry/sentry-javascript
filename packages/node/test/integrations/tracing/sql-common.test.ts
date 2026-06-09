/*
 * Tests ported from @opentelemetry/sql-common@0.41.2
 * Original source: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/packages/sql-common
 * Licensed under the Apache License, Version 2.0
 */

import type { SpanContext } from '@opentelemetry/api';
import { createTraceState, INVALID_SPAN_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import { addSqlCommenterComment } from '../../../src/integrations/tracing/utils/sql-common';

describe('addSqlCommenterComment', () => {
  it('adds comment to a simple query', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
    };

    const query = 'SELECT * from FOO;';
    expect(addSqlCommenterComment(trace.wrapSpanContext(spanContext), query)).toBe(
      "SELECT * from FOO; /*traceparent='00-d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-01'*/",
    );
  });

  it('does not add a comment if query already has a comment', () => {
    const span = trace.wrapSpanContext({
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
    });

    const blockComment = 'SELECT * from FOO; /* Test comment */';
    expect(addSqlCommenterComment(span, blockComment)).toBe(blockComment);

    const dashedComment = 'SELECT * from FOO; -- Test comment';
    expect(addSqlCommenterComment(span, dashedComment)).toBe(dashedComment);
  });

  it('does not add a comment to an empty query', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
    };

    expect(addSqlCommenterComment(trace.wrapSpanContext(spanContext), '')).toBe('');
  });

  it('does not add a comment if span context is invalid', () => {
    const query = 'SELECT * from FOO;';
    expect(addSqlCommenterComment(trace.wrapSpanContext(INVALID_SPAN_CONTEXT), query)).toBe(query);
  });

  it('correctly also sets trace state', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
      traceState: createTraceState('foo=bar,baz=qux'),
    };

    const query = 'SELECT * from FOO;';
    expect(addSqlCommenterComment(trace.wrapSpanContext(spanContext), query)).toBe(
      "SELECT * from FOO; /*traceparent='00-d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-01',tracestate='foo%3Dbar%2Cbaz%3Dqux'*/",
    );
  });

  it('escapes special characters in values', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
      traceState: createTraceState("foo='bar,baz='qux!()*',hack='DROP TABLE"),
    };

    const query = 'SELECT * from FOO;';
    expect(addSqlCommenterComment(trace.wrapSpanContext(spanContext), query)).toBe(
      "SELECT * from FOO; /*traceparent='00-d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-01',tracestate='foo%3D%27bar%2Cbaz%3D%27qux%21%28%29%2A%27%2Chack%3D%27DROP%20TABLE'*/",
    );
  });

  // Known limitation: `--` inside a string literal is treated as an
  // existing comment, so no sqlcommenter comment is appended.
  it('does not add a comment when -- appears inside a string literal', () => {
    const span = trace.wrapSpanContext({
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
    });

    const query = "SELECT '-- not a comment';";
    expect(addSqlCommenterComment(span, query)).toBe(query);
  });

  it('adds a comment when an opening /* has no closing */', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
    };

    const query = 'SELECT 1 /* unclosed';
    expect(addSqlCommenterComment(trace.wrapSpanContext(spanContext), query)).toBe(
      `${query} /*traceparent='00-d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-01'*/`,
    );
  });
});
