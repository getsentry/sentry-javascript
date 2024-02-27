import { getTracePropagationData } from '../../src/server/utils';

const MOCK_REQUEST_EVENT: any = {
  request: {
    headers: {
      get: (key: string) => {
        if (key === 'sentry-trace') {
          return '1234567890abcdef1234567890abcdef-1234567890abcdef-1';
        }

        if (key === 'baggage') {
          return (
            'sentry-environment=production,sentry-release=1.0.0,sentry-transaction=dogpark,' +
            'sentry-public_key=dogsarebadatkeepingsecrets,' +
            'sentry-trace_id=1234567890abcdef1234567890abcdef,sentry-sample_rate=1'
          );
        }

        return null;
      },
    },
  },
};

describe('getTracePropagationData', () => {
  it('returns sentryTrace & baggage strings if both are available', () => {
    const event: any = MOCK_REQUEST_EVENT;

    const { sentryTrace, baggage } = getTracePropagationData(event);

    expect(sentryTrace).toEqual('1234567890abcdef1234567890abcdef-1234567890abcdef-1');
    expect(baggage?.split(',').sort()).toEqual([
      'sentry-environment=production',
      'sentry-public_key=dogsarebadatkeepingsecrets',
      'sentry-release=1.0.0',
      'sentry-sample_rate=1',
      'sentry-trace_id=1234567890abcdef1234567890abcdef',
      'sentry-transaction=dogpark',
    ]);
  });

  it('returns empty if the necessary header is not available', () => {
    const event: any = { request: { headers: { get: () => undefined } } };
    const { sentryTrace, baggage } = getTracePropagationData(event);

    expect(sentryTrace).toBe('');
    expect(baggage).toBeUndefined();
  });
});
