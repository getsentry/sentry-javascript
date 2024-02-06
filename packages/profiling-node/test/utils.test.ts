import type { DsnComponents, Event, SdkMetadata } from '@sentry/types';
import { addItemToEnvelope, createEnvelope, uuid4 } from '@sentry/utils';

import {
  addProfilesToEnvelope,
  findProfiledTransactionsFromEnvelope,
  isValidProfile,
  isValidSampleRate,
} from '../src/utils';

import type { Profile, ProfiledEvent } from '../src/types';
import {
  createProfilingEventEnvelope,
  isProfiledTransactionEvent,
  maybeRemoveProfileFromSdkMetadata,
} from '../src/utils';

function makeSdkMetadata(props: Partial<SdkMetadata['sdk']>): SdkMetadata {
  return {
    sdk: {
      ...props,
    },
  };
}

function makeDsn(props: Partial<DsnComponents>): DsnComponents {
  return {
    protocol: 'http',
    projectId: '1',
    host: 'localhost',
    ...props,
  };
}

function makeEvent(
  props: Partial<ProfiledEvent>,
  profile: NonNullable<ProfiledEvent['sdkProcessingMetadata']['profile']>,
): ProfiledEvent {
  return { ...props, sdkProcessingMetadata: { profile: profile } };
}

function makeProfile(
  props: Partial<ProfiledEvent['sdkProcessingMetadata']['profile']>,
): NonNullable<ProfiledEvent['sdkProcessingMetadata']['profile']> {
  return {
    profile_id: '1',
    profiler_logging_mode: 'lazy',
    stacks: [],
    samples: [
      { elapsed_since_start_ns: '0', thread_id: '0', stack_id: 0 },
      { elapsed_since_start_ns: '10', thread_id: '0', stack_id: 0 },
    ],
    measurements: {},
    resources: [],
    frames: [],
    ...props,
  };
}

describe('isProfiledTransactionEvent', () => {
  it('profiled event', () => {
    expect(isProfiledTransactionEvent({ sdkProcessingMetadata: { profile: {} } })).toBe(true);
  });
  it('not profiled event', () => {
    expect(isProfiledTransactionEvent({ sdkProcessingMetadata: { something: {} } })).toBe(false);
  });
});

describe('maybeRemoveProfileFromSdkMetadata', () => {
  it('removes profile', () => {
    expect(maybeRemoveProfileFromSdkMetadata({ sdkProcessingMetadata: { profile: {} } })).toEqual({
      sdkProcessingMetadata: {},
    });
  });

  it('does nothing', () => {
    expect(maybeRemoveProfileFromSdkMetadata({ sdkProcessingMetadata: { something: {} } })).toEqual({
      sdkProcessingMetadata: { something: {} },
    });
  });
});

describe('createProfilingEventEnvelope', () => {
  it('throws if profile_id is not set', () => {
    const profile = makeProfile({});
    delete profile.profile_id;

    expect(() =>
      createProfilingEventEnvelope(makeEvent({ type: 'transaction' }, profile), makeDsn({}), makeSdkMetadata({})),
    ).toThrow('Cannot construct profiling event envelope without a valid profile id. Got undefined instead.');
  });
  it('throws if profile is undefined', () => {
    expect(() =>
      // @ts-expect-error mock profile as undefined
      createProfilingEventEnvelope(makeEvent({ type: 'transaction' }, undefined), makeDsn({}), makeSdkMetadata({})),
    ).toThrow('Cannot construct profiling event envelope without a valid profile. Got undefined instead.');
    expect(() =>
      // @ts-expect-error mock profile as null
      createProfilingEventEnvelope(makeEvent({ type: 'transaction' }, null), makeDsn({}), makeSdkMetadata({})),
    ).toThrow('Cannot construct profiling event envelope without a valid profile. Got null instead.');
  });

  it('envelope header is of type: profile', () => {
    const envelope = createProfilingEventEnvelope(
      makeEvent(
        { type: 'transaction' },
        makeProfile({
          samples: [
            { elapsed_since_start_ns: '0', thread_id: '0', stack_id: 0 },
            { elapsed_since_start_ns: '0', thread_id: '0', stack_id: 0 },
          ],
        }),
      ),
      makeDsn({}),
      makeSdkMetadata({
        name: 'sentry.javascript.node',
        version: '1.2.3',
        integrations: ['integration1', 'integration2'],
        packages: [
          { name: 'package1', version: '1.2.3' },
          { name: 'package2', version: '4.5.6' },
        ],
      }),
    );
    expect(envelope?.[1][0]?.[0].type).toBe('profile');
  });

  it('returns if samples.length <= 1', () => {
    const envelope = createProfilingEventEnvelope(
      makeEvent(
        { type: 'transaction' },
        makeProfile({
          samples: [{ elapsed_since_start_ns: '0', thread_id: '0', stack_id: 0 }],
        }),
      ),
      makeDsn({}),
      makeSdkMetadata({
        name: 'sentry.javascript.node',
        version: '1.2.3',
        integrations: ['integration1', 'integration2'],
        packages: [
          { name: 'package1', version: '1.2.3' },
          { name: 'package2', version: '4.5.6' },
        ],
      }),
    );
    expect(envelope).toBe(null);
  });

  it('enriches envelope with sdk metadata', () => {
    const envelope = createProfilingEventEnvelope(
      makeEvent({ type: 'transaction' }, makeProfile({})),
      makeDsn({}),
      makeSdkMetadata({
        name: 'sentry.javascript.node',
        version: '1.2.3',
      }),
    );

    expect(envelope && envelope[0]?.sdk?.name).toBe('sentry.javascript.node');
    expect(envelope && envelope[0]?.sdk?.version).toBe('1.2.3');
  });

  it('handles undefined sdk metadata', () => {
    const envelope = createProfilingEventEnvelope(
      makeEvent({ type: 'transaction' }, makeProfile({})),
      makeDsn({}),
      undefined,
    );

    expect(envelope?.[0].sdk).toBe(undefined);
  });

  it('enriches envelope with dsn metadata', () => {
    const envelope = createProfilingEventEnvelope(
      makeEvent({ type: 'transaction' }, makeProfile({})),
      makeDsn({
        host: 'sentry.io',
        projectId: '123',
        protocol: 'https',
        path: 'path',
        port: '9000',
        publicKey: 'publicKey',
      }),
      makeSdkMetadata({}),
      'tunnel',
    );

    expect(envelope?.[0].dsn).toBe('https://publicKey@sentry.io:9000/path/123');
  });

  it('enriches profile with device info', () => {
    const envelope = createProfilingEventEnvelope(
      makeEvent({ type: 'transaction' }, makeProfile({})),
      makeDsn({}),
      makeSdkMetadata({}),
    );
    const profile = envelope?.[1][0]?.[1] as unknown as Profile;

    expect(typeof profile.device.manufacturer).toBe('string');
    expect(typeof profile.device.model).toBe('string');
    expect(typeof profile.os.name).toBe('string');
    expect(typeof profile.os.version).toBe('string');

    expect(profile.device.manufacturer.length).toBeGreaterThan(0);
    expect(profile.device.model.length).toBeGreaterThan(0);
    expect(profile.os.name.length).toBeGreaterThan(0);
    expect(profile.os.version.length).toBeGreaterThan(0);
  });

  it('throws if event.type is not a transaction', () => {
    expect(() =>
      createProfilingEventEnvelope(
        makeEvent(
          // @ts-expect-error force invalid value
          { type: 'error' },
          // @ts-expect-error mock tid as undefined
          makeProfile({ samples: [{ stack_id: 0, thread_id: undefined, elapsed_since_start_ns: '0' }] }),
        ),
        makeDsn({}),
        makeSdkMetadata({}),
      ),
    ).toThrow('Profiling events may only be attached to transactions, this should never occur.');
  });

  it('inherits transaction properties', () => {
    const start = new Date(2022, 8, 1, 12, 0, 0);
    const end = new Date(2022, 8, 1, 12, 0, 10);

    const envelope = createProfilingEventEnvelope(
      makeEvent(
        {
          event_id: uuid4(),
          type: 'transaction',
          transaction: 'transaction-name',
          start_timestamp: start.getTime() / 1000,
          timestamp: end.getTime() / 1000,
          contexts: {
            trace: {
              span_id: 'span_id',
              trace_id: 'trace_id',
            },
          },
        },
        makeProfile({
          samples: [
            // @ts-expect-error mock tid as undefined
            { stack_id: 0, thread_id: undefined, elapsed_since_start_ns: '0' },
            // @ts-expect-error mock tid as undefined
            { stack_id: 0, thread_id: undefined, elapsed_since_start_ns: '0' },
          ],
        }),
      ),
      makeDsn({}),
      makeSdkMetadata({}),
    );

    const profile = envelope?.[1][0]?.[1] as unknown as Profile;

    expect(profile.transaction.name).toBe('transaction-name');
    expect(typeof profile.transaction.id).toBe('string');
    expect(profile.transaction.id?.length).toBe(32);
    expect(profile.transaction.trace_id).toBe('trace_id');
  });
});

describe('isValidSampleRate', () => {
  it.each([
    [0, true],
    [0.1, true],
    [1, true],
    [true, true],
    [false, true],
    // invalid values
    [1.1, false],
    [-0.1, false],
    [NaN, false],
    [Infinity, false],
    [null, false],
    [undefined, false],
    ['', false],
    [' ', false],
    [{}, false],
    [[], false],
    [() => null, false],
  ])('value %s is %s', (input, expected) => {
    expect(isValidSampleRate(input)).toBe(expected);
  });
});

describe('isValidProfile', () => {
  it('is not valid if samples <= 1', () => {
    expect(isValidProfile(makeProfile({ samples: [] }))).toBe(false);
  });

  it('is not valid if it does not have a profile_id', () => {
    expect(isValidProfile(makeProfile({ samples: [], profile_id: undefined } as any))).toBe(false);
  });
});

describe('addProfilesToEnvelope', () => {
  it('adds profile', () => {
    const profile = makeProfile({});
    const envelope = createEnvelope({});

    // @ts-expect-error profile is untyped
    addProfilesToEnvelope(envelope, [profile]);

    // @ts-expect-error profile is untyped
    const addedBySdk = addItemToEnvelope(createEnvelope({}), [{ type: 'profile' }, profile]);

    expect(envelope?.[1][0]?.[0]).toEqual({ type: 'profile' });
    expect(envelope?.[1][0]?.[1]).toEqual(profile);

    expect(JSON.stringify(addedBySdk)).toEqual(JSON.stringify(envelope));
  });
});

describe('findProfiledTransactionsFromEnvelope', () => {
  it('returns transactions with profile context', () => {
    const txnWithProfile: Event = {
      event_id: uuid4(),
      type: 'transaction',
      contexts: {
        profile: {
          profile_id: uuid4(),
        },
      },
    };

    const envelope = addItemToEnvelope(createEnvelope({}), [{ type: 'transaction' }, txnWithProfile]);
    expect(findProfiledTransactionsFromEnvelope(envelope)[0]).toBe(txnWithProfile);
  });

  it('skips if transaction event is not profiled', () => {
    const txnWithProfile: Event = {
      event_id: uuid4(),
      type: 'transaction',
      contexts: {},
    };

    const envelope = addItemToEnvelope(createEnvelope({}), [{ type: 'transaction' }, txnWithProfile]);
    expect(findProfiledTransactionsFromEnvelope(envelope)[0]).toBe(undefined);
  });

  it('skips if event is not a transaction', () => {
    const nonTransactionEvent: Event = {
      event_id: uuid4(),
      type: 'replay_event',
      contexts: {
        profile: {
          profile_id: uuid4(),
        },
      },
    };

    // @ts-expect-error replay event is partial
    const envelope = addItemToEnvelope(createEnvelope({}), [{ type: 'replay_event' }, nonTransactionEvent]);
    expect(findProfiledTransactionsFromEnvelope(envelope)[0]).toBe(undefined);
  });
});
