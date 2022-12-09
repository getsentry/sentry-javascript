import '@sentry/tracing';

import * as Sentry from '@sentry/node';
import type { Transport } from '@sentry/types';

import { ProfilingIntegration } from './index';
import type { Profile } from './utils';

const STATIC_TRANSPORT = {
  send: jest.fn().mockImplementation(() => {
    return Promise.resolve();
  }),
  flush: jest.fn().mockImplementation(() => Promise.resolve()),
};

const transport = (): Transport => {
  return STATIC_TRANSPORT;
};

function findAllProfiles(mock: jest.Mock<any, any>): any[] | null {
  return mock.mock.calls.filter(call => {
    return call[0][1][0][0].type === 'profile';
  });
}

function findProfile(mock: jest.Mock<any, any>): Profile | null {
  return (
    mock.mock.calls.find(call => {
      return call[0][1][0][0].type === 'profile';
    })?.[0][1][0][1] ?? null
  );
}

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  tracesSampleRate: 1,
  profilesSampleRate: 1, // Set sampling rate
  integrations: [new ProfilingIntegration()],
  transport: transport,
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Sentry - Profiling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('profiles a transaction', async () => {
    const transaction = Sentry.startTransaction({ name: 'title' });
    await wait(100);
    transaction.finish();

    await Sentry.flush();
    expect(findProfile(STATIC_TRANSPORT.send)).not.toBe(null);
  });

  it('can profile overlapping transactions', async () => {
    const t1 = Sentry.startTransaction({ name: 'outer' });
    const t2 = Sentry.startTransaction({ name: 'inner' });
    await wait(100);
    t2.finish();
    t1.finish();

    await Sentry.flush();

    expect(findAllProfiles(STATIC_TRANSPORT.send)?.[0]?.[0]?.[1]?.[0]?.[1].transactions[0].name).toBe('inner');
    expect(findAllProfiles(STATIC_TRANSPORT.send)?.[1]?.[0]?.[1]?.[0]?.[1].transactions[0].name).toBe('outer');
    expect(findAllProfiles(STATIC_TRANSPORT.send)).toHaveLength(2);
    expect(findProfile(STATIC_TRANSPORT.send)).not.toBe(null);
  });

  it('does not discard overlapping transaction with same title', async () => {
    const t1 = Sentry.startTransaction({ name: 'same-title' });
    const t2 = Sentry.startTransaction({ name: 'same-title' });
    await wait(100);
    t2.finish();
    t1.finish();

    await Sentry.flush();
    expect(findAllProfiles(STATIC_TRANSPORT.send)).toHaveLength(2);
    expect(findProfile(STATIC_TRANSPORT.send)).not.toBe(null);
  });

  it('does not crash if finish is called multiple times', async () => {
    const transaction = Sentry.startTransaction({ name: 'title' });
    await wait(100);
    transaction.finish();
    transaction.finish();

    await Sentry.flush();
    expect(findAllProfiles(STATIC_TRANSPORT.send)).toHaveLength(1);
    expect(findProfile(STATIC_TRANSPORT.send)).not.toBe(null);
  });
});
