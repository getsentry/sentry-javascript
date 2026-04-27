import { describe, expect, it } from 'vitest';
import { isWrappableBody, readQueueEnvelope, wrapBodyWithTraceContext } from '../../src/utils/queueEnvelope';

describe('isWrappableBody', () => {
  it('returns true for plain objects', () => {
    expect(isWrappableBody({ a: 1 })).toBe(true);
    expect(isWrappableBody({})).toBe(true);
  });

  it('returns false for null/undefined/primitives', () => {
    expect(isWrappableBody(null)).toBe(false);
    expect(isWrappableBody(undefined)).toBe(false);
    expect(isWrappableBody(42)).toBe(false);
    expect(isWrappableBody('string')).toBe(false);
    expect(isWrappableBody(true)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isWrappableBody([1, 2, 3])).toBe(false);
  });

  it('returns false for ArrayBuffer and typed arrays', () => {
    expect(isWrappableBody(new ArrayBuffer(8))).toBe(false);
    expect(isWrappableBody(new Uint8Array(8))).toBe(false);
    expect(isWrappableBody(new Float32Array(2))).toBe(false);
  });
});

describe('wrapBodyWithTraceContext / readQueueEnvelope', () => {
  it('round-trips trace context (sampled=true) and body', () => {
    const meta = { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), sampled: true };
    const original = { hello: 'world', n: 1 };
    const wrapped = wrapBodyWithTraceContext(original, meta);

    expect(wrapped).toEqual({ __sentry_v1: meta, body: original });

    const decoded = readQueueEnvelope(wrapped);
    expect(decoded).not.toBeNull();
    expect(decoded!.__sentry_v1).toEqual(meta);
    expect(decoded!.body).toBe(original);
  });

  it('round-trips an unsampled trace context', () => {
    const meta = { trace_id: 'c'.repeat(32), span_id: 'd'.repeat(16), sampled: false };
    const wrapped = wrapBodyWithTraceContext({ x: 1 }, meta);
    const decoded = readQueueEnvelope(wrapped);
    expect(decoded?.__sentry_v1.sampled).toBe(false);
  });

  it('returns null for non-envelope bodies', () => {
    expect(readQueueEnvelope({ plain: 'object' })).toBeNull();
    expect(readQueueEnvelope('string')).toBeNull();
    expect(readQueueEnvelope(null)).toBeNull();
    expect(readQueueEnvelope(42)).toBeNull();
    expect(readQueueEnvelope([1, 2, 3])).toBeNull();
  });

  it('returns null when __sentry_v1 lacks the required fields', () => {
    expect(readQueueEnvelope({ __sentry_v1: {}, body: {} })).toBeNull();
    expect(readQueueEnvelope({ __sentry_v1: { trace_id: 'a' }, body: {} })).toBeNull();
    expect(readQueueEnvelope({ __sentry_v1: { span_id: 'b' }, body: {} })).toBeNull();
    expect(readQueueEnvelope({ __sentry_v1: 'not an object', body: {} })).toBeNull();
  });
});
