import { extractSentrytraceData } from '../src/utils';

describe('extractSentrytraceData', () => {
  test('no sample', () => {
    const data = extractSentrytraceData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb') as any;

    expect(data).toBeDefined();
    expect(data.parentSpanId).toEqual('bbbbbbbbbbbbbbbb');
    expect(data.traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(data?.parentSampled).toBeUndefined();
  });

  test('sample true', () => {
    const data = extractSentrytraceData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-1') as any;

    expect(data).toBeDefined();
    expect(data.parentSampled).toBeTruthy();
  });

  test('sample false', () => {
    const data = extractSentrytraceData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-0') as any;

    expect(data).toBeDefined();
    expect(data.parentSampled).toBeFalsy();
  });

  test('just sample decision - false', () => {
    const data = extractSentrytraceData('0') as any;

    expect(data).toBeDefined();
    expect(data.traceId).toBeUndefined();
    expect(data.spanId).toBeUndefined();
    expect(data.parentSampled).toBeFalsy();
  });

  test('just sample decision - true', () => {
    const data = extractSentrytraceData('1') as any;

    expect(data).toBeDefined();
    expect(data.traceId).toBeUndefined();
    expect(data.spanId).toBeUndefined();
    expect(data.parentSampled).toBeTruthy();
  });

  test('invalid', () => {
    // trace id wrong length
    expect(extractSentrytraceData('a-bbbbbbbbbbbbbbbb-1')).toBeUndefined();

    // parent span id wrong length
    expect(extractSentrytraceData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-b-1')).toBeUndefined();

    // parent sampling decision wrong length
    expect(extractSentrytraceData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-11')).toBeUndefined();

    // trace id invalid hex value
    expect(extractSentrytraceData('someStuffHereWhichIsNotAtAllHexy-bbbbbbbbbbbbbbbb-1')).toBeUndefined();

    // parent span id invalid hex value
    expect(extractSentrytraceData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-alsoNotSuperHexy-1')).toBeUndefined();

    // bogus sampling decision
    expect(extractSentrytraceData('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-x')).toBeUndefined();
  });
});
