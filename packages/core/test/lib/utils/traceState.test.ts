import { describe, expect, it } from 'vitest';
import { TraceState } from '../../../src/utils/traceState';

describe('TraceState', () => {
  it('returns undefined for unknown keys', () => {
    expect(new TraceState().get('missing')).toBeUndefined();
  });

  it('set returns a new instance and leaves the original unchanged', () => {
    const original = new TraceState();
    const next = original.set('a', '1');

    expect(next).not.toBe(original);
    expect(original.get('a')).toBeUndefined();
    expect(next.get('a')).toBe('1');
  });

  it('moves an updated key to the front of the serialized list', () => {
    const state = new TraceState().set('a', '1').set('b', '2').set('a', '3');

    expect(state.get('a')).toBe('3');
    expect(state.serialize()).toBe('a=3,b=2');
  });

  it('serializes newest entries first', () => {
    const state = new TraceState().set('a', '1').set('b', '2').set('c', '3');

    expect(state.serialize()).toBe('c=3,b=2,a=1');
  });

  it('unset removes the key and returns a new instance', () => {
    const state = new TraceState().set('a', '1').set('b', '2');
    const next = state.unset('a');

    expect(next).not.toBe(state);
    expect(state.get('a')).toBe('1');
    expect(next.get('a')).toBeUndefined();
    expect(next.serialize()).toBe('b=2');
  });

  it('serializes an empty state to an empty string', () => {
    expect(new TraceState().serialize()).toBe('');
  });
});
