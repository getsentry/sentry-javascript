import { extractSentrytraceData, extractTracestateData } from '../src/utils';

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

describe('extractTracestateData', () => {
  it.each([
    // sentry only
    ['sentry only', 'sentry=doGsaREgReaT', 'sentry=doGsaREgReaT', undefined],
    // sentry only, invalid (`!` isn't a valid base64 character)
    ['sentry only, invalid', 'sentry=doGsaREgReaT!', undefined, undefined],
    // stuff before
    ['stuff before', 'maisey=silly,sentry=doGsaREgReaT', 'sentry=doGsaREgReaT', 'maisey=silly'],
    // stuff after
    ['stuff after', 'sentry=doGsaREgReaT,maisey=silly', 'sentry=doGsaREgReaT', 'maisey=silly'],
    // stuff before and after
    [
      'stuff before and after',
      'charlie=goofy,sentry=doGsaREgReaT,maisey=silly',
      'sentry=doGsaREgReaT',
      'charlie=goofy,maisey=silly',
    ],
    // multiple before
    [
      'multiple before',
      'charlie=goofy,maisey=silly,sentry=doGsaREgReaT',
      'sentry=doGsaREgReaT',
      'charlie=goofy,maisey=silly',
    ],
    // multiple after
    [
      'multiple after',
      'sentry=doGsaREgReaT,charlie=goofy,maisey=silly',
      'sentry=doGsaREgReaT',
      'charlie=goofy,maisey=silly',
    ],
    // multiple before and after
    [
      'multiple before and after',
      'charlie=goofy,maisey=silly,sentry=doGsaREgReaT,bodhi=floppy,cory=loyal',
      'sentry=doGsaREgReaT',
      'charlie=goofy,maisey=silly,bodhi=floppy,cory=loyal',
    ],
    // only third-party data
    ['only third-party data', 'maisey=silly', undefined, 'maisey=silly'],
    // invalid third-party data, valid sentry data
    [
      'invalid third-party data, valid sentry data',
      'maisey_is_silly,sentry=doGsaREgReaT',
      'sentry=doGsaREgReaT',
      undefined,
    ],
    // valid third party data, invalid sentry data
    ['valid third-party data, invalid sentry data', 'maisey=silly,sentry=doGsaREgReaT!', undefined, 'maisey=silly'],
    // nothing valid at all
    ['nothing valid at all', 'maisey_is_silly,sentry=doGsaREgReaT!', undefined, undefined],
  ])('%s', (_testTitle: string, header: string, sentry?: string, thirdparty?: string): void => {
    expect(extractTracestateData(header)).toEqual({ sentry, thirdparty });
  });
});
