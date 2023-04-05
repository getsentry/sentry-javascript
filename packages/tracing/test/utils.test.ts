/* eslint-disable deprecation/deprecation */
import { extractTraceparentData, hasTracingEnabled } from '../src';

describe('hasTracingEnabled (deprecated)', () => {
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
    // eslint-disable-next-line deprecation/deprecation
    (_: string, input: Parameters<typeof hasTracingEnabled>[0], output: ReturnType<typeof hasTracingEnabled>) => {
      // eslint-disable-next-line deprecation/deprecation
      expect(hasTracingEnabled(input)).toBe(output);
    },
  );
});

describe('extractTraceparentData', () => {
  test('no sample', () => {
    const data = extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb') as any;

    expect(data).toBeDefined();
    expect(data.parentSpanId).toEqual('bbbbbbbbbbbbbbbb');
    expect(data.traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(data?.parentSampled).toBeUndefined();
  });

  test('sample true', () => {
    const data = extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-1') as any;

    expect(data).toBeDefined();
    expect(data.parentSampled).toBeTruthy();
  });

  test('sample false', () => {
    const data = extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-0') as any;

    expect(data).toBeDefined();
    expect(data.parentSampled).toBeFalsy();
  });

  test('just sample decision - false', () => {
    const data = extractTraceparentData('0') as any;

    expect(data).toBeDefined();
    expect(data.traceId).toBeUndefined();
    expect(data.spanId).toBeUndefined();
    expect(data.parentSampled).toBeFalsy();
  });

  test('just sample decision - true', () => {
    const data = extractTraceparentData('1') as any;

    expect(data).toBeDefined();
    expect(data.traceId).toBeUndefined();
    expect(data.spanId).toBeUndefined();
    expect(data.parentSampled).toBeTruthy();
  });

  test('invalid', () => {
    // empty string
    expect(extractTraceparentData('')).toBeUndefined();

    // trace id wrong length
    expect(extractTraceparentData('a-bbbbbbbbbbbbbbbb-1')).toBeUndefined();

    // parent span id wrong length
    expect(extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-b-1')).toBeUndefined();

    // parent sampling decision wrong length
    expect(extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-11')).toBeUndefined();

    // trace id invalid hex value
    expect(extractTraceparentData('someStuffHereWhichIsNotAtAllHexy-bbbbbbbbbbbbbbbb-1')).toBeUndefined();

    // parent span id invalid hex value
    expect(extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-alsoNotSuperHexy-1')).toBeUndefined();

    // bogus sampling decision
    expect(extractTraceparentData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-x')).toBeUndefined();
  });
});
