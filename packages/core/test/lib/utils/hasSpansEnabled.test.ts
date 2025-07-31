import { describe, expect, it } from 'vitest';
import { hasSpansEnabled } from '../../../src';

describe('hasSpansEnabled', () => {
  const tracesSampler = () => 1;
  const tracesSampleRate = 1;
  it.each([
    ['No options', undefined, false],
    ['No tracesSampler or tracesSampleRate', {}, false],
    ['With tracesSampler', { tracesSampler }, true],
    ['With tracesSampleRate', { tracesSampleRate }, true],
    ['With tracesSampleRate=undefined', { tracesSampleRate: undefined }, false],
    ['With tracesSampleRate=0', { tracesSampleRate: 0 }, true],
    ['With tracesSampler=undefined', { tracesSampler: undefined }, false],
    ['With tracesSampler and tracesSampleRate', { tracesSampler, tracesSampleRate }, true],
  ])('%s', (_: string, input: Parameters<typeof hasSpansEnabled>[0], output: ReturnType<typeof hasSpansEnabled>) => {
    expect(hasSpansEnabled(input)).toBe(output);
  });
});
