import type { Event } from '@sentry/types';
import { addItemToEnvelope, createEnvelope, uuid4 } from '@sentry/utils';

import {
  addProfilesToEnvelope,
  findProfiledTransactionsFromEnvelope,
  isValidProfile,
  isValidSampleRate,
} from '../src/utils';

import type { ProfiledEvent } from '../src/types';

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
