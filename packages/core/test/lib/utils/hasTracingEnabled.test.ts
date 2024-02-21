import { hasTracingEnabled } from '../../../src';

describe('hasTracingEnabled', () => {
  const tracesSampler = () => 1;
  const tracesSampleRate = 1;
  it.each([
    ['No options', undefined, false],
    ['No tracesSampler or tracesSampleRate or enableTracing', {}, false],
    ['With tracesSampler', { tracesSampler }, true],
    ['With tracesSampleRate', { tracesSampleRate }, true],
    ['With enableTracing=true', { enableTracing: true }, true],
    ['With enableTracing=false', { enableTracing: false }, false],
    ['With tracesSampler && enableTracing=false', { tracesSampler, enableTracing: false }, true],
    ['With tracesSampleRate && enableTracing=false', { tracesSampler, enableTracing: false }, true],
    ['With tracesSampler and tracesSampleRate', { tracesSampler, tracesSampleRate }, true],
    [
      'With tracesSampler and tracesSampleRate and enableTracing=true',
      { tracesSampler, tracesSampleRate, enableTracing: true },
      true,
    ],
    [
      'With tracesSampler and tracesSampleRate and enableTracing=false',
      { tracesSampler, tracesSampleRate, enableTracing: false },
      true,
    ],
  ])(
    '%s',
    (_: string, input: Parameters<typeof hasTracingEnabled>[0], output: ReturnType<typeof hasTracingEnabled>) => {
      expect(hasTracingEnabled(input)).toBe(output);
    },
  );
});
