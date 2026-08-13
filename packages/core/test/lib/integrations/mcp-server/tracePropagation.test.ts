import { describe, expect, it } from 'vitest';
import { extractMcpTraceContext } from '../../../../src/integrations/mcp-server/tracePropagation';

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const PARENT_SPAN_ID = '00f067aa0ba902b7';

describe('extractMcpTraceContext', () => {
  it('extracts sampled trace context and converts it for continueTrace', () => {
    const traceparent = `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`;

    expect(
      extractMcpTraceContext({
        _meta: {
          traceparent,
          tracestate: 'rojo=00f067aa0ba902b7,congo=t61rcWkgMzE',
          baggage: 'sentry-environment=production,sentry-release=1.0.0',
        },
      }),
    ).toEqual({
      traceparent,
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
      tracestate: 'rojo=00f067aa0ba902b7,congo=t61rcWkgMzE',
      baggage: 'sentry-environment=production,sentry-release=1.0.0',
      parentContext: {
        traceId: TRACE_ID,
        spanId: PARENT_SPAN_ID,
        isRemote: true,
        traceFlags: 1,
      },
    });
  });

  it('extracts an unsampled trace context without optional propagation fields', () => {
    const traceparent = `00-${TRACE_ID}-${PARENT_SPAN_ID}-00`;

    expect(extractMcpTraceContext({ _meta: { traceparent } })).toEqual({
      traceparent,
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-0`,
      parentContext: {
        traceId: TRACE_ID,
        spanId: PARENT_SPAN_ID,
        isRemote: true,
        traceFlags: 0,
      },
    });
  });

  it.each([
    ['sampled', '03', 1, '1'],
    ['unsampled', '02', 0, '0'],
    ['all flags set', 'ff', 1, '1'],
  ])('uses only the sampling bit for %s flags', (_description, flags, expectedTraceFlags, expectedSampled) => {
    const traceparent = `00-${TRACE_ID}-${PARENT_SPAN_ID}-${flags}`;

    expect(extractMcpTraceContext({ _meta: { traceparent } })).toEqual({
      traceparent,
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-${expectedSampled}`,
      parentContext: {
        traceId: TRACE_ID,
        spanId: PARENT_SPAN_ID,
        isRemote: true,
        traceFlags: expectedTraceFlags,
      },
    });
  });

  it.each([
    ['without additional fields', `01-${TRACE_ID}-${PARENT_SPAN_ID}-01`, 1, '1'],
    ['with additional fields', `01-${TRACE_ID}-${PARENT_SPAN_ID}-03-vendor-data`, 1, '1'],
    ['at the highest supported version', `fe-${TRACE_ID}-${PARENT_SPAN_ID}-00-future`, 0, '0'],
  ])('accepts a future traceparent version %s', (_description, traceparent, expectedTraceFlags, expectedSampled) => {
    expect(extractMcpTraceContext({ _meta: { traceparent } })).toEqual({
      traceparent,
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-${expectedSampled}`,
      parentContext: {
        traceId: TRACE_ID,
        spanId: PARENT_SPAN_ID,
        isRemote: true,
        traceFlags: expectedTraceFlags,
      },
    });
  });

  it('ignores non-string baggage and tracestate values', () => {
    const traceparent = `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`;

    expect(
      extractMcpTraceContext({
        _meta: {
          traceparent,
          baggage: ['sentry-environment=production'],
          tracestate: 123,
        },
      }),
    ).toEqual({
      traceparent,
      sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
      parentContext: {
        traceId: TRACE_ID,
        spanId: PARENT_SPAN_ID,
        isRemote: true,
        traceFlags: 1,
      },
    });
  });

  it.each([
    ['empty', '', ''],
    ['oversized', `tenant=${'a'.repeat(8186)}`, `vendor=${'a'.repeat(506)}`],
  ])(
    'ignores %s optional propagation fields without discarding valid traceparent',
    (_description, baggage, tracestate) => {
      const traceparent = `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`;

      expect(extractMcpTraceContext({ _meta: { traceparent, baggage, tracestate } })).toEqual({
        traceparent,
        sentryTrace: `${TRACE_ID}-${PARENT_SPAN_ID}-1`,
        parentContext: {
          traceId: TRACE_ID,
          spanId: PARENT_SPAN_ID,
          isRemote: true,
          traceFlags: 1,
        },
      });
    },
  );

  it('accepts optional propagation fields at their maximum lengths', () => {
    const traceparent = `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`;
    const baggage = `key=${'a'.repeat(8188)}`;
    const tracestate = `key=${'a'.repeat(508)}`;

    expect(extractMcpTraceContext({ _meta: { traceparent, baggage, tracestate } })).toEqual(
      expect.objectContaining({ traceparent, baggage, tracestate }),
    );
  });

  it.each([
    ['missing params', undefined],
    ['null params', null],
    ['array params', []],
    ['missing _meta', {}],
    ['null _meta', { _meta: null }],
    ['array _meta', { _meta: [] }],
    ['missing traceparent', { _meta: {} }],
    ['non-string traceparent', { _meta: { traceparent: 123 } }],
  ])('does not extract context for %s', (_description, params) => {
    expect(extractMcpTraceContext(params)).toBeUndefined();
  });

  it.each([
    ['the forbidden ff version', `ff-${TRACE_ID}-${PARENT_SPAN_ID}-01`],
    ['an uppercase version', `FF-${TRACE_ID}-${PARENT_SPAN_ID}-01`],
    ['an all-zero trace id', `00-00000000000000000000000000000000-${PARENT_SPAN_ID}-01`],
    ['an all-zero parent span id', `00-${TRACE_ID}-0000000000000000-01`],
    ['a one-character trace flag', `00-${TRACE_ID}-${PARENT_SPAN_ID}-1`],
    ['an uppercase trace id', `00-${TRACE_ID.toUpperCase()}-${PARENT_SPAN_ID}-01`],
    ['an uppercase parent span id', `00-${TRACE_ID}-${PARENT_SPAN_ID.toUpperCase()}-01`],
    ['a truncated trace id', `00-${TRACE_ID.slice(1)}-${PARENT_SPAN_ID}-01`],
    ['a truncated parent span id', `00-${TRACE_ID}-${PARENT_SPAN_ID.slice(1)}-01`],
    ['an extra field on version 00', `00-${TRACE_ID}-${PARENT_SPAN_ID}-01-extra`],
    ['more than one leading whitespace character', `  00-${TRACE_ID}-${PARENT_SPAN_ID}-01`],
    ['more than one trailing whitespace character', `00-${TRACE_ID}-${PARENT_SPAN_ID}-01  `],
    ['an oversized value', `01-${TRACE_ID}-${PARENT_SPAN_ID}-01-${'a'.repeat(512)}`],
  ])('rejects traceparent with %s', (_description, traceparent) => {
    expect(extractMcpTraceContext({ _meta: { traceparent } })).toBeUndefined();
  });

  it.each([
    ['leading whitespace', ` 00-${TRACE_ID}-${PARENT_SPAN_ID}-01`],
    ['trailing whitespace', `00-${TRACE_ID}-${PARENT_SPAN_ID}-01 `],
  ])('accepts traceparent with a single %s character', (_description, traceparent) => {
    expect(extractMcpTraceContext({ _meta: { traceparent } })?.parentContext).toEqual({
      traceId: TRACE_ID,
      spanId: PARENT_SPAN_ID,
      isRemote: true,
      traceFlags: 1,
    });
  });
});
